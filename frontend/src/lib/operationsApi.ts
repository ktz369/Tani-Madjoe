/**
 * API Client Services for Precision Agricultural Operations (OPS-04)
 */

import { api } from './api';
import {
  LaborLog,
  CreateLaborLogPayload,
  IrrigationLog,
  CreateIrrigationLogPayload,
  SaprotanItem,
  CreateSaprotanItemPayload,
  SaprotanApplication,
  ApplySaprotanPayload,
  PestScoutingReport,
  CreatePestScoutingPayload,
  FinancialSummary,
  PostHarvestLog,
  HarvestClosingPayload,
} from '@/types/operations';

export const operationsApi = {
  // Labor (HOK)
  getLaborLogs: async (plotId: number): Promise<LaborLog[]> => {
    try {
      const res = await api.get<LaborLog[]>(`/v1/plots/${plotId}/labor`);
      return Array.isArray(res.data) ? res.data : [];
    } catch {
      return [];
    }
  },

  createLaborLog: async (plotId: number, payload: CreateLaborLogPayload): Promise<LaborLog> => {
    const res = await api.post<LaborLog>(`/v1/plots/${plotId}/labor`, payload);
    return res.data;
  },

  // Irrigation & Fuel
  getIrrigationLogs: async (plotId: number): Promise<IrrigationLog[]> => {
    try {
      const res = await api.get<IrrigationLog[]>(`/v1/plots/${plotId}/irrigation`);
      return Array.isArray(res.data) ? res.data : [];
    } catch {
      return [];
    }
  },

  createIrrigationLog: async (
    plotId: number,
    payload: CreateIrrigationLogPayload
  ): Promise<IrrigationLog> => {
    const res = await api.post<IrrigationLog>(`/v1/plots/${plotId}/irrigation`, payload);
    return res.data;
  },

  // Saprotan Inventory & Applications
  getSaprotanCatalog: async (): Promise<SaprotanItem[]> => {
    try {
      const res = await api.get<SaprotanItem[]>('/v1/saprotan');
      return Array.isArray(res.data) ? res.data : [];
    } catch {
      return [];
    }
  },

  createSaprotanItem: async (payload: CreateSaprotanItemPayload): Promise<SaprotanItem> => {
    const res = await api.post<SaprotanItem>('/v1/saprotan', payload);
    return res.data;
  },

  getSaprotanApplications: async (plotId: number): Promise<SaprotanApplication[]> => {
    try {
      const res = await api.get<SaprotanApplication[]>(`/v1/plots/${plotId}/saprotan-applications`);
      return Array.isArray(res.data) ? res.data : [];
    } catch {
      return [];
    }
  },

  applySaprotan: async (
    plotId: number,
    payload: ApplySaprotanPayload
  ): Promise<SaprotanApplication> => {
    const res = await api.post<SaprotanApplication>(`/v1/plots/${plotId}/apply-saprotan`, payload);
    return res.data;
  },

  // Pest Scouting (OPT)
  getPestScoutingReports: async (plotId: number): Promise<PestScoutingReport[]> => {
    try {
      const res = await api.get<PestScoutingReport[]>(`/v1/plots/${plotId}/scouting`);
      return Array.isArray(res.data) ? res.data : [];
    } catch {
      return [];
    }
  },

  createPestScoutingReport: async (
    plotId: number,
    payload: CreatePestScoutingPayload
  ): Promise<PestScoutingReport> => {
    const res = await api.post<PestScoutingReport>(`/v1/plots/${plotId}/scouting`, payload);
    return res.data;
  },

  // Economics & Running HPP
  getFinancialSummary: async (plotId: number): Promise<FinancialSummary> => {
    const res = await api.get<FinancialSummary>(`/v1/plots/${plotId}/financial-summary`);
    return res.data;
  },

  // Post-Harvest Closing (14% Moisture Standardization)
  closeHarvest: async (
    plotId: number,
    payload: HarvestClosingPayload
  ): Promise<PostHarvestLog> => {
    const res = await api.post<PostHarvestLog>(`/v1/plots/${plotId}/harvest-closing`, payload);
    return res.data;
  },

  getPostHarvestLogs: async (plotId: number): Promise<PostHarvestLog[]> => {
    try {
      const res = await api.get<PostHarvestLog[]>(`/v1/plots/${plotId}/post-harvest`);
      return Array.isArray(res.data) ? res.data : [];
    } catch {
      return [];
    }
  },
};
