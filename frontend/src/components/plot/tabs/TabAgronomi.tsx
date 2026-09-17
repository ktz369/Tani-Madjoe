"use client";

import React from "react";
import { DigitalAgronomyPanel } from "@/components/plot";
import { Plot } from "@/types";

export interface TabAgronomiProps {
  plot: Plot;
  currentHst: number;
}

export default function TabAgronomi({ plot, currentHst }: TabAgronomiProps) {
  return (
    <div className="py-2">
      <DigitalAgronomyPanel
        plotId={plot.id}
        plotName={plot.name}
        areaHectares={plot.area_hectares}
        cropType={plot.crop_type}
        currentHst={currentHst}
      />
    </div>
  );
}
