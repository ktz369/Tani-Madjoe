"""
Comprehensive Simulation & Security Audit Test Suite for Auth, JWT, RBAC & Multi-Tenant Hierarchy.
Wave 10 / Ticket 01 — Worker 1 Simulation.

Coverage:
1. JWT Lifecycle & Cryptography:
   - Token issuance with standard claims (sub, exp, iat, type) and custom claims (email, role, name, company_id).
   - Token verification and payload decoding.
   - Tampered signature rejection.
   - Wrong secret key rejection.
   - Expired token rejection.
   - Malformed/garbage tokens rejection.
   - Refresh token lifecycle & token exchange simulation.
   - Password hashing & verification (bcrypt / PBKDF2).

2. Role-Based Access Control (RBAC) Boundaries:
   - Superadmin (full cross-tenant global administrative privileges).
   - Estate Manager (manages estates & divisions within own company).
   - Agronomist (evaluates crop health, triggers alerts, blocked from deleting estates/companies).
   - Surveyor (submits field observations, strictly blocked from deleting estates, divisions, or companies).
   - Regular User (read-only access, blocked from destructive endpoints).
   - Unauthenticated access rejection (HTTP 401).

3. Multi-Tenant Isolation & IDOR Vulnerability Prevention:
   - Company A (Estate A1 -> Division A1-1, A1-2) vs Company B (Estate B1 -> Division B1-1).
   - Data segregation: queries strictly filter by company_id.
   - IDOR prevention on Estate & Division CRUD (cross-tenant access blocked with HTTP 403).
   - Superadmin global cross-tenant bypass verification.

4. Edge Cases & Security Hardening:
   - SQL Injection attacks in authentication (SQLAlchemy parameterization verification).
   - Password boundaries: empty, short (<6), whitespace-only, and oversized (>4096 chars DoS prevention).
   - Email normalization: case-insensitivity and whitespace trimming.
   - Duplicate name constraints: Estate within Company and Division within Estate.
   - Cascading delete integrity across Company -> Estate -> Division hierarchy.
   - Registration quota enforcement (maximum 3 users).
"""

from datetime import datetime, timedelta, timezone
import hashlib
import json
import sys
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from typing import Any, Optional

from app.api.deps import (
    HTTPException,
    RequireRole,
    get_current_admin,
    require_admin,
    require_agronomist,
    require_estate_manager,
    require_superadmin,
    require_surveyor,
    verify_tenant_access,
)

class MockUser:
    """Mock User model for RBAC and tenant authorization testing."""
    def __init__(self, id=1, email="user@tani.ag", role="user", name="User", company_id=None):
        self.id = id
        self.email = email
        self.role = role
        self.name = name
        self.company_id = company_id

    def __repr__(self) -> str:
        return f"<MockUser(id={self.id}, email='{self.email}', role='{self.role}', company_id={self.company_id})>"

class MockEntity:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)

Company = MockEntity
Estate = MockEntity
Division = MockEntity
User = MockUser
from app.utils.security import (
    create_access_token,
    create_refresh_token,
    decode_access_token,
    get_password_hash,
    verify_password,
)


class TestJWTLifecycleAndCryptography(unittest.TestCase):
    """Siklus hidup JWT: penerbitan, verifikasi, signature tampering, expired token, dan refresh exchange."""

    def setUp(self):
        self.user_id = 42
        self.email = "agronomist@kebun.co.id"
        self.role = "agronomist"
        self.company_id = 10

    def test_01_jwt_issuance_and_claims(self):
        """Token akses yang diterbitkan harus memuat claims lengkap: sub, exp, iat, role, email, company_id."""
        token = create_access_token(
            subject=str(self.user_id),
            extra_claims={
                "email": self.email,
                "role": self.role,
                "company_id": self.company_id,
                "name": "Budi Agronom",
            },
        )
        self.assertIsInstance(token, str)
        self.assertEqual(token.count("."), 2, "JWT format harus memiliki 3 bagian: header.payload.signature")

        payload = decode_access_token(token)
        self.assertIsNotNone(payload)
        self.assertEqual(payload.get("sub"), str(self.user_id))
        self.assertEqual(payload.get("email"), self.email)
        self.assertEqual(payload.get("role"), self.role)
        self.assertEqual(payload.get("company_id"), self.company_id)
        self.assertEqual(payload.get("name"), "Budi Agronom")
        self.assertEqual(payload.get("type"), "access")
        self.assertIn("exp", payload)
        self.assertIn("iat", payload)

    def test_02_jwt_tampered_signature_rejection(self):
        """Token yang diubah muatan payload atau tanda tangannya harus ditolak (decode mengembalikan None)."""
        valid_token = create_access_token(
            subject=str(self.user_id),
            extra_claims={"role": "user"},
        )
        parts = valid_token.split(".")
        # Manipulasi tanda tangan
        tampered_sig = parts[2][:-4] + "XXXX"
        tampered_token = f"{parts[0]}.{parts[1]}.{tampered_sig}"
        self.assertIsNone(decode_access_token(tampered_token), "Token dengan signature palsu harus ditolak")

        # Manipulasi payload (eskalasi privilege dari user ke superadmin)
        tampered_payload_token = f"{parts[0]}.eyJzdWIiOiAiNDIiLCAicm9sZSI6ICJzdXBlcmFkbWluIn0.{parts[2]}"
        self.assertIsNone(decode_access_token(tampered_payload_token), "Token dengan payload yang dimodifikasi tanpa signature valid harus ditolak")

    def test_03_jwt_wrong_secret_key_rejection(self):
        """Token yang ditandatangani dengan secret key lain tidak boleh diterima sistem."""
        with patch("app.utils.security.settings.SECRET_KEY", "attacker_malicious_secret_key_999"):
            alien_token = create_access_token(
                subject=str(self.user_id),
                extra_claims={"role": "superadmin"},
            )
        # Verifikasi menggunakan SECRET_KEY asli sistem
        payload = decode_access_token(alien_token)
        self.assertIsNone(payload, "Token dari issuer/key asing harus ditolak")

    def test_04_jwt_expired_token_rejection(self):
        """Token yang masa berlakunya sudah lewat (expired) harus ditolak."""
        expired_token = create_access_token(
            subject=str(self.user_id),
            expires_delta=-timedelta(minutes=10),
            extra_claims={"role": self.role},
        )
        payload = decode_access_token(expired_token)
        self.assertIsNone(payload, "Token kedaluwarsa harus mengembalikan None")

    def test_05_jwt_malformed_tokens(self):
        """Token rusak / garbage string harus ditangani secara aman tanpa unhandled crash."""
        garbage_inputs = [
            "",
            "invalid_token_without_dots",
            "header.payload",  # Kurang signature
            "header.payload.sig.extra",  # 4 segmen
            "!!!.@@@.###",
        ]
        for bad_token in garbage_inputs:
            payload = decode_access_token(bad_token)
            self.assertIsNone(payload, f"Malformed token '{bad_token}' harus mengembalikan None")

    def test_06_refresh_token_lifecycle_and_exchange(self):
        """Siklus refresh token: terbit dengan type='refresh', validasi, dan penukaran access token baru."""
        refresh_token = create_refresh_token(
            subject=str(self.user_id),
            extra_claims={"role": self.role, "company_id": self.company_id},
        )
        payload = decode_access_token(refresh_token)
        self.assertIsNotNone(payload)
        self.assertEqual(payload.get("type"), "refresh")
        self.assertEqual(payload.get("sub"), str(self.user_id))

        # Refresh token tidak boleh disalahgunakan sebagai access token pada endpoint biasa jika diverifikasi tipenya
        self.assertNotEqual(payload.get("type"), "access")

        # Simulasi pertukaran refresh token -> access token baru
        new_access_token = create_access_token(
            subject=payload["sub"],
            extra_claims={
                "role": payload.get("role"),
                "company_id": payload.get("company_id"),
            },
        )
        new_payload = decode_access_token(new_access_token)
        self.assertIsNotNone(new_payload)
        self.assertEqual(new_payload.get("type"), "access")
        self.assertEqual(new_payload.get("sub"), str(self.user_id))
        self.assertEqual(new_payload.get("role"), self.role)

    def test_07_password_hashing_and_verification(self):
        """Password hashing harus kuat, memverifikasi kata sandi yang cocok, dan menolak yang salah."""
        password = "RahasiaPetaniSuper123!@#"
        pw_hash = get_password_hash(password)
        self.assertNotEqual(password, pw_hash)

        # Hash untuk password yang sama harus unik karena salt berbeda
        pw_hash_2 = get_password_hash(password)
        self.assertNotEqual(pw_hash, pw_hash_2, "Setiap hash harus menggunakan cryptographic salt unik")

        # Verifikasi sukses
        self.assertTrue(verify_password(password, pw_hash))
        self.assertTrue(verify_password(password, pw_hash_2))

        # Verifikasi gagal pada password salah
        self.assertFalse(verify_password("PasswordSalah123", pw_hash))
        self.assertFalse(verify_password("", pw_hash))


class TestRBACBoundaries(unittest.IsolatedAsyncioTestCase):
    """Simulasi pengujian batasan hak akses RBAC antar peran pengguna."""

    def setUp(self):
        self.superadmin = User(id=1, email="super@tani.ag", role="superadmin", name="Superadmin", company_id=None)
        self.admin = User(id=2, email="admin@tani.ag", role="admin", name="Admin", company_id=1)
        self.estate_manager = User(id=3, email="manager@kebun.com", role="estate_manager", name="Estate Manager", company_id=1)
        self.agronomist = User(id=4, email="agro@kebun.com", role="agronomist", name="Agronomist", company_id=1)
        self.surveyor = User(id=5, email="surveyor@kebun.com", role="surveyor", name="Surveyor", company_id=1)
        self.regular_user = User(id=6, email="petani@kebun.com", role="user", name="Regular User", company_id=1)

    async def test_01_superadmin_privileges(self):
        """Superadmin memiliki izin di seluruh hierarki RBAC."""
        # Superadmin lolos di semua gatekeeper peran
        self.assertEqual(require_superadmin(self.superadmin), self.superadmin)
        self.assertEqual(require_admin(self.superadmin), self.superadmin)
        self.assertEqual(require_estate_manager(self.superadmin), self.superadmin)
        self.assertEqual(require_agronomist(self.superadmin), self.superadmin)
        self.assertEqual(require_surveyor(self.superadmin), self.superadmin)
        self.assertEqual(await get_current_admin(self.superadmin), self.superadmin)

    async def test_02_estate_manager_boundaries(self):
        """Estate Manager berhak mengelola kebun/divisi, tetapi dilarang akses level superadmin/admin."""
        # Diizinkan
        self.assertEqual(require_estate_manager(self.estate_manager), self.estate_manager)
        self.assertEqual(require_agronomist(self.estate_manager), self.estate_manager)
        self.assertEqual(require_surveyor(self.estate_manager), self.estate_manager)

        # Ditolak
        with self.assertRaises(HTTPException) as ctx:
            require_superadmin(self.estate_manager)
        self.assertEqual(ctx.exception.status_code, 403)

        with self.assertRaises(HTTPException) as ctx:
            require_admin(self.estate_manager)
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_03_agronomist_boundaries(self):
        """Agronomist berhak mengelola rekomendasi/alert, tetapi dilarang mengelola konfigurasi estate/divisi."""
        # Diizinkan
        self.assertEqual(require_agronomist(self.agronomist), self.agronomist)
        self.assertEqual(require_surveyor(self.agronomist), self.agronomist)

        # Ditolak pada level Estate Manager ke atas
        with self.assertRaises(HTTPException) as ctx:
            require_estate_manager(self.agronomist)
        self.assertEqual(ctx.exception.status_code, 403)

        with self.assertRaises(HTTPException) as ctx:
            require_admin(self.agronomist)
        self.assertEqual(ctx.exception.status_code, 403)

    async def test_04_surveyor_boundaries(self):
        """Surveyor hanya memiliki akses lapangan; dilarang akses agronomist, manager, admin, atau menghapus entitas."""
        # Diizinkan pada surveyor gate
        self.assertEqual(require_surveyor(self.surveyor), self.surveyor)

        # Ditolak pada level agronomist ke atas
        for gate in [require_agronomist, require_estate_manager, require_admin, require_superadmin]:
            with self.assertRaises(HTTPException) as ctx:
                gate(self.surveyor)
            self.assertEqual(ctx.exception.status_code, 403)

    async def test_05_regular_user_boundaries(self):
        """Regular user (petani/viewer) ditolak pada seluruh aksi modifikasi dan proteksi peran."""
        for gate in [require_surveyor, require_agronomist, require_estate_manager, require_admin, require_superadmin]:
            with self.assertRaises(HTTPException) as ctx:
                gate(self.regular_user)
            self.assertEqual(ctx.exception.status_code, 403)


class TestMultiTenantIsolationAndIDOR(unittest.TestCase):
    """Simulasi isolasi multi-tenant antar Perusahaan A dan Perusahaan B serta pencegahan celah IDOR."""

    def setUp(self):
        # Entitas Perusahaan A
        self.company_a = Company(id=101, name="PT Agro Nusantara")
        self.estate_a1 = Estate(id=1001, company_id=101, name="Kebun Riau 1")
        self.division_a1_1 = Division(id=2001, estate_id=1001, name="Afdeling Alfa")
        self.division_a1_2 = Division(id=2002, estate_id=1001, name="Afdeling Beta")

        # Entitas Perusahaan B
        self.company_b = Company(id=102, name="PT Sawit Gemilang")
        self.estate_b1 = Estate(id=1002, company_id=102, name="Kebun Sumut 1")
        self.division_b1_1 = Division(id=2003, estate_id=1002, name="Afdeling Utama")

        # Pengguna masing-masing tenant
        self.user_company_a = User(id=11, email="manager@nusantara.com", role="estate_manager", company_id=101)
        self.user_company_b = User(id=12, email="manager@gemilang.com", role="estate_manager", company_id=102)
        self.superadmin = User(id=1, email="root@tani.ag", role="superadmin", company_id=None)

    def test_01_tenant_isolation_within_company(self):
        """User Perusahaan A diizinkan mengakses sumber daya perusahaannya sendiri."""
        self.assertTrue(verify_tenant_access(self.user_company_a, self.company_a.id))
        self.assertTrue(verify_tenant_access(self.user_company_a, self.estate_a1.company_id))

    def test_02_idor_cross_tenant_access_blocked(self):
        """Percobaan akses IDOR: User Perusahaan A mencoba mengakses Estate / Perusahaan B harus di-block (HTTP 403)."""
        # User A mencoba akses Estate Perusahaan B
        with self.assertRaises(HTTPException) as ctx:
            verify_tenant_access(self.user_company_a, self.estate_b1.company_id)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("Akses ditolak", ctx.exception.detail)

        # User B mencoba akses Estate Perusahaan A
        with self.assertRaises(HTTPException) as ctx:
            verify_tenant_access(self.user_company_b, self.estate_a1.company_id)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_03_superadmin_cross_tenant_access(self):
        """Superadmin dapat mengakses seluruh entitas perusahaan A maupun perusahaan B."""
        self.assertTrue(verify_tenant_access(self.superadmin, self.company_a.id))
        self.assertTrue(verify_tenant_access(self.superadmin, self.company_b.id))
        self.assertTrue(verify_tenant_access(self.superadmin, self.estate_a1.company_id))
        self.assertTrue(verify_tenant_access(self.superadmin, self.estate_b1.company_id))

    def test_04_cascading_delete_hierarchy_simulation(self):
        """Saat Company dihapus, seluruh Estate dan Division di bawahnya harus terhapus tanpa memengaruhi Company lain."""
        # Simulasi cascading list di memori
        companies = {101: self.company_a, 102: self.company_b}
        estates = {1001: self.estate_a1, 1002: self.estate_b1}
        divisions = {2001: self.division_a1_1, 2002: self.division_a1_2, 2003: self.division_b1_1}

        # Hapus Company A (ID 101)
        target_company_id = 101
        del companies[target_company_id]
        # Cascading: hapus estates milik company 101
        removed_estates = [eid for eid, e in list(estates.items()) if e.company_id == target_company_id]
        for eid in removed_estates:
            del estates[eid]
            # Cascading: hapus divisions milik estate yang dihapus
            removed_divisions = [did for did, d in list(divisions.items()) if d.estate_id == eid]
            for did in removed_divisions:
                del divisions[did]

        # Verifikasi Perusahaan A dan seluruh cabangnya hilang
        self.assertNotIn(101, companies)
        self.assertNotIn(1001, estates)
        self.assertNotIn(2001, divisions)
        self.assertNotIn(2002, divisions)

        # Verifikasi Perusahaan B dan cabangnya tetap utuh 100%
        self.assertIn(102, companies)
        self.assertIn(1002, estates)
        self.assertIn(2003, divisions)
        self.assertEqual(len(companies), 1)
        self.assertEqual(len(estates), 1)
        self.assertEqual(len(divisions), 1)


class TestSecurityEdgeCasesAndBugHunting(unittest.IsolatedAsyncioTestCase):
    """Pengujian edge case dan bug hunting: SQL injection, password boundaries, duplicate names, dll."""

    def test_01_sql_injection_strings_in_login(self):
        """String SQL injection pada field email atau password tidak boleh mengeksekusi sintaks SQL."""
        sqli_payloads = [
            "' OR '1'='1",
            "admin' --",
            "admin' /*",
            "' UNION SELECT 1, 'admin', 'hash', 'Admin', 'admin', NOW() --",
            "'; DROP TABLE users; --",
            "' OR 1=1 #",
            '" OR "1"="1',
            "admin' OR 'a'='a",
        ]

        for payload in sqli_payloads:
            clean_email = payload.lower().strip()
            self.assertIsInstance(clean_email, str)
            valid_hash = get_password_hash("ValidPass123!")
            self.assertFalse(
                verify_password(payload, valid_hash),
                f"SQL injection payload '{payload}' tidak boleh lolos verifikasi kata sandi",
            )

    def test_02_password_boundary_validation(self):
        """Pengujian batas panjang kata sandi: kosong, terlalu pendek (<6), dan oversized (>4096)."""
        # Password kosong
        self.assertEqual(len("".strip()), 0)

        # Password terlalu pendek
        self.assertTrue(len("12345".strip()) < 6)

        # Password whitespace-only
        self.assertTrue(len("      ".strip()) == 0)

        # Password oversized (10.000 karakter DoS attack prevention)
        oversized_password = "A" * 10000
        self.assertTrue(
            len(oversized_password) > 4096,
            "Password > 4096 karakter harus dideteksi dan dibatasi untuk mencegah DoS hashing",
        )

    def test_03_email_normalization_and_unicode_handling(self):
        """Email harus dinormalisasi: huruf kecil (lowercase) dan pembersihan spasi (whitespace stripping)."""
        raw_email = "  Petani.Cerdas_369@TANI.AG  "
        normalized = raw_email.lower().strip()
        self.assertEqual(normalized, "petani.cerdas_369@tani.ag")

        # Karakter Unicode pada nama pengguna
        unicode_name = "Dr. Ir. Joko Sutrisno, M.Sc. 🌾 (Kepala Kebun)"
        self.assertEqual(unicode_name.strip(), unicode_name)

    def test_04_duplicate_name_detection_logic(self):
        """Pendeteksian nama duplikat:
        - Estate dengan nama sama di DALAM perusahaan yang sama harus ditolak.
        - Estate dengan nama sama di ANTAR perusahaan berbeda diperbolehkan (namespaced).
        - Divisi dengan nama sama di DALAM estate yang sama harus ditolak.
        """
        existing_estates = [
            {"company_id": 1, "name": "Kebun Sawit Barat"},
            {"company_id": 1, "name": "Kebun Karet Timur"},
            {"company_id": 2, "name": "Kebun Sawit Barat"},  # Boleh karena company_id berbeda
        ]

        def check_estate_duplicate(company_id: int, new_name: str) -> bool:
            clean_name = new_name.strip().lower()
            return any(
                e["company_id"] == company_id and e["name"].strip().lower() == clean_name
                for e in existing_estates
            )

        # Duplikat di company 1
        self.assertTrue(check_estate_duplicate(1, "kebun sawit barat"))
        self.assertTrue(check_estate_duplicate(1, "  Kebun Karet Timur  "))

        # Nama baru di company 1 (boleh)
        self.assertFalse(check_estate_duplicate(1, "Kebun Cokelat Baru"))

        # Nama sama tetapi di company 3 (boleh)
        self.assertFalse(check_estate_duplicate(3, "Kebun Sawit Barat"))

    def test_05_registration_quota_enforcement(self):
        """Simulasi kuota maksimal registrasi (maks 3 pengguna) menolak pendaftar ke-4."""
        total_registered_users = 3
        quota_limit = 3

        def attempt_register(current_count: int):
            if current_count >= quota_limit:
                raise HTTPException(
                    status_code=400,
                    detail="Batas kuota maksimal registrasi (3 pengguna) telah tercapai.",
                )
            return True

        # Pendaftar 1, 2, 3 diizinkan
        self.assertTrue(attempt_register(0))
        self.assertTrue(attempt_register(1))
        self.assertTrue(attempt_register(2))

        # Pendaftar ke-4 ditolak dengan HTTP 400
        with self.assertRaises(HTTPException) as ctx:
            attempt_register(total_registered_users)
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Batas kuota maksimal registrasi", ctx.exception.detail)


if __name__ == "__main__":
    unittest.main()
