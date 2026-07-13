"use client";

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { useEffect, useState, useRef } from "react";

// --- INTERFACES ---
interface MrfInward {
  id: string;
  created_at: string;
  weight_kg: number;
  scale_photo_url: string;
  operator_name: string;
}

interface MrfOutward {
  id: string;
  created_at: string;
  declared_weight_kg: number;
  gwmc_weight_kg: number | null;
  status: string; // 'Pending GWMC', 'Verified', 'Flagged'
  destination_plant: string;
}

export default function MRFTracking() {
  const [loading, setLoading] = useState(true);
  const [jurisdiction, setJurisdiction] = useState("Loading Workspace...");
  
  // Data States
  const [inwardLogs, setInwardLogs] = useState<MrfInward[]>([]);
  const [outwardLogs, setOutwardLogs] = useState<MrfOutward[]>([]);
  const [currentInventoryKg, setCurrentInventoryKg] = useState(0);
  
  // Constants
  const MAX_CAPACITY_KG = 5000; // Assume 5 Tons max capacity per village shed

  // Modal States
  const [showInwardModal, setShowInwardModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [weightInput, setWeightInput] = useState("");
  const [scalePhoto, setScalePhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. FETCH REAL DATA ON LOAD
  const fetchMrfData = async () => {
  setLoading(true);
  try {
    const response = await fetch('/api/panchayat/mrf');
    const data = await response.json();
    
    if (data.error) throw new Error(data.error);

    setJurisdiction(`${data.jurisdiction} MRF Shed`);
    setInwardLogs(data.inward);
    setOutwardLogs(data.outward);

    const totalIn = data.inward.reduce((sum: number, log: any) => sum + Number(log.weight_kg), 0);
    const totalOut = data.outward.reduce((sum: number, log: any) => sum + Number(log.declared_weight_kg), 0);
    setCurrentInventoryKg(Math.max(0, totalIn - totalOut));
  } catch (error) {
    console.error("Failed to load:", error);
  } finally {
    setLoading(false);
  }
};

  useEffect(() => {
    fetchMrfData();
  }, []);

  // 2. HANDLE INWARD SUBMISSION (ADDING WASTE)
  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setScalePhoto(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const submitInwardLog = async () => {
    if (!weightInput || !scalePhoto) return alert("Weight and Photo are mandatory!");
    setIsSubmitting(true);

    try {
      // 1. Upload Photo to Supabase Storage
      const fileExt = scalePhoto.name.split('.').pop();
      const fileName = `mrf-scale-${Date.now()}.${fileExt}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('reports') // Or create an 'mrf_photos' bucket
        .upload(`mrf/${fileName}`, scalePhoto);

      if (uploadError) throw uploadError;

      // 2. Save Record to Database
      const { data: { user } } = await supabase.auth.getUser();
      const panchayatName = jurisdiction.replace(" MRF Shed", "");

      const { error: dbError } = await supabase
        .from('mrf_inward')
        .insert({
          panchayat_name: panchayatName,
          weight_kg: parseFloat(weightInput),
          scale_photo_url: fileName,
          operator_name: user?.email || 'Secretary'
        });

      if (dbError) throw dbError;

      alert(`Successfully logged ${weightInput}kg into the MRF shed.`);
      setShowInwardModal(false);
      setWeightInput("");
      setScalePhoto(null);
      setPhotoPreview(null);
      fetchMrfData(); // Refresh Dashboard

    } catch (error) {
      console.error("Submission failed:", error);
      alert("Failed to save entry. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. HANDLE GWMC PICKUP REQUEST
  const requestGwmcPickup = async () => {
    const confirmSend = confirm(
      `Your shed currently holds ${currentInventoryKg.toLocaleString()}kg of baled waste.\n\nThis will notify the regional GWMC office. Proceed?`
    );

    if (!confirmSend) return;

    try {
      // Call the API route instead of inserting directly from the frontend
      const response = await fetch('/api/panchayat/mrf/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          weight: currentInventoryKg,
          panchayat: jurisdiction.replace(" MRF Shed", "") 
        })
      });

      const result = await response.json();
      if (!result.success) throw new Error(result.error);
      
      alert("Dispatch Request Sent! GWMC has been notified.");
      fetchMrfData();

    } catch (error) {
      console.error("Pickup request failed:", error);
      alert("Failed to send pickup request.");
    }
};

  // UI Calculations
  const capacityPercent = Math.min(100, Math.round((currentInventoryKg / MAX_CAPACITY_KG) * 100));
  const isShedFull = capacityPercent >= 80;

  if (loading && inwardLogs.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-emerald-800 font-bold tracking-wide">Syncing Weighbridge Data...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/50 p-6 lg:p-10">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">MRF Capacity & Dispatches</h1>
          <p className="text-emerald-600 mt-1 font-bold flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></span>
            {jurisdiction}
          </p>
        </div>
        <div className="flex gap-3 mt-4 md:mt-0">
          <button 
            onClick={() => setShowInwardModal(true)}
            className="bg-indigo-600 text-white font-bold px-5 py-2.5 rounded-lg shadow-sm hover:bg-indigo-700 transition-colors flex items-center gap-2"
          >
            <span>⚖️</span> Log Shed Inward
          </button>
          <button 
            onClick={requestGwmcPickup}
            disabled={currentInventoryKg < 500}
            className={`border-2 font-bold px-5 py-2.5 rounded-lg shadow-sm transition-colors ${
              isShedFull 
                ? 'bg-red-600 border-red-600 text-white hover:bg-red-700 animate-pulse' 
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50'
            }`}
          >
            🚚 Request GWMC Pickup
          </button>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between md:col-span-2">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">MRF Shed Current Load</h3>
            <span className={`text-xs font-black px-3 py-1 rounded-full ${isShedFull ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
              {MAX_CAPACITY_KG - currentInventoryKg} kg Available Space
            </span>
          </div>
          <div>
            <p className="text-4xl font-black text-slate-800">
              {currentInventoryKg.toLocaleString()} <span className="text-xl text-slate-500 font-bold">/ {MAX_CAPACITY_KG.toLocaleString()} kg</span>
            </p>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-3 mt-4 overflow-hidden border border-slate-200">
            <div 
              className={`h-full rounded-full transition-all duration-1000 ${isShedFull ? 'bg-red-500' : capacityPercent > 50 ? 'bg-amber-500' : 'bg-emerald-500'}`} 
              style={{ width: `${capacityPercent}%` }}
            ></div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">Total Dispatched to GWMC</h3>
          <p className="text-4xl font-black text-emerald-600 mt-2">
            {outwardLogs.reduce((acc, curr) => acc + Number(curr.gwmc_weight_kg || curr.declared_weight_kg), 0).toLocaleString()} <span className="text-lg text-slate-500">kg</span>
          </p>
          <p className="text-xs font-bold text-slate-500 mt-3 bg-slate-100 inline-block px-2 py-1 rounded">
            Across {outwardLogs.length} Trips
          </p>
        </div>
      </div>

      {/* TABLES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        
        {/* INWARD TABLE */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-[500px]">
          <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Panchayat Inward Logs</h2>
              <p className="text-xs font-medium text-slate-500">Waste weighed before entering shed.</p>
            </div>
          </div>
          <div className="overflow-y-auto flex-1 p-2">
            {inwardLogs.length === 0 ? (
               <p className="text-center text-slate-400 mt-10 font-medium">No waste logged recently.</p>
            ) : (
              <div className="space-y-3">
                {inwardLogs.map(log => (
                  <div key={log.id} className="p-4 border border-slate-100 rounded-xl hover:bg-slate-50 transition flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {log.scale_photo_url && (
                        <img 
                          src={`https://ytmuudbkuhkfqkzchtce.supabase.co/storage/v1/object/public/reports/mrf/${log.scale_photo_url}`} 
                          alt="Scale reading" 
                          className="w-12 h-12 rounded object-cover border border-slate-200"
                        />
                      )}
                      <div>
                        <p className="font-bold text-slate-800">+{log.weight_kg} kg</p>
                        <p className="text-xs text-slate-500">{new Date(log.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                    <span className="text-xs font-mono text-slate-400">{log.operator_name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* OUTWARD (GWMC) TABLE */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-[500px]">
          <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
            <div>
              <h2 className="text-lg font-bold text-slate-800">GWMC Outward Audits</h2>
              <p className="text-xs font-medium text-slate-500">Verifies your declared weight against GWMC plants.</p>
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead className="bg-white sticky top-0 shadow-sm z-10">
                <tr className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                  <th className="p-4 border-b border-slate-100">Date & Status</th>
                  <th className="p-4 border-b border-slate-100 text-right">Panchayat Weight</th>
                  <th className="p-4 border-b border-slate-100 text-right">GWMC Verified</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {outwardLogs.map(log => {
                  const declared = Number(log.declared_weight_kg);
                  const verified = log.gwmc_weight_kg !== null ? Number(log.gwmc_weight_kg) : null;
                  
                  // Verification Logic
                  const isPending = log.status === 'Pending GWMC';
                  const variance = verified ? ((verified - declared) / declared) * 100 : 0;
                  const isFlagged = verified && Math.abs(variance) > 5; // Flag if difference is > 5%

                  return (
                    <tr key={log.id} className={`hover:bg-slate-50 transition-colors ${isFlagged ? 'bg-red-50/30' : ''}`}>
                      <td className="p-4">
                        <div className="text-xs text-slate-600 font-bold mb-1">
                          {new Date(log.created_at).toLocaleDateString()}
                        </div>
                        {isPending ? (
                          <span className="text-[9px] font-black bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded uppercase">In Transit</span>
                        ) : isFlagged ? (
                          <span className="text-[9px] font-black bg-red-100 text-red-700 px-1.5 py-0.5 rounded uppercase">Mismatch Flag</span>
                        ) : (
                          <span className="text-[9px] font-black bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded uppercase">Verified Clean</span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        <div className="font-bold text-slate-600">{declared.toLocaleString()} kg</div>
                      </td>
                      <td className="p-4 text-right">
                        {isPending ? (
                           <div className="text-xs text-slate-400 italic">Awaiting Plant...</div>
                        ) : (
                          <>
                            <div className={`font-black ${isFlagged ? 'text-red-600' : 'text-emerald-600'}`}>
                              {verified?.toLocaleString()} kg
                            </div>
                            <div className={`text-[10px] font-bold mt-1 ${isFlagged ? 'text-red-500' : 'text-slate-400'}`}>
                              {variance > 0 ? '+' : ''}{variance.toFixed(1)}% diff
                            </div>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {outwardLogs.length === 0 && (
                   <tr><td colSpan={3} className="text-center p-10 text-slate-400 font-medium">No dispatch records found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* --- INWARD LOG MODAL --- */}
      {showInwardModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-slate-900 p-5 text-white flex justify-between items-center">
              <h3 className="font-black text-xl">Log MRF Inward</h3>
              <button onClick={() => setShowInwardModal(false)} className="text-slate-400 hover:text-white font-black">✕</button>
            </div>
            
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">1. Weighing Scale Photo *</label>
                {!photoPreview ? (
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full h-32 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-100 transition-colors"
                  >
                    <span className="text-3xl mb-1">📸</span>
                    <p className="font-bold text-slate-600 text-sm">Snap scale reading</p>
                  </div>
                ) : (
                  <div className="relative w-full h-32 rounded-xl overflow-hidden border-2 border-emerald-500">
                    <img src={photoPreview} alt="Scale Preview" className="w-full h-full object-cover" />
                    <button onClick={() => { setScalePhoto(null); setPhotoPreview(null); }} className="absolute top-2 right-2 bg-black/50 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">✕</button>
                  </div>
                )}
                <input type="file" accept="image/*" capture="environment" ref={fileInputRef} className="hidden" onChange={handlePhotoCapture} />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">2. Exact Weight on Machine *</label>
                <div className="relative">
                  <input 
                    type="number" 
                    value={weightInput}
                    onChange={(e) => setWeightInput(e.target.value)}
                    placeholder="e.g. 150.5"
                    className="w-full pl-4 pr-12 py-3 border border-slate-300 rounded-xl font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <span className="absolute right-4 top-3 text-slate-400 font-bold">kg</span>
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-slate-100 bg-slate-50 flex gap-3">
              <button onClick={() => setShowInwardModal(false)} className="flex-1 bg-white border-2 border-slate-200 text-slate-700 font-bold py-3 rounded-xl hover:bg-slate-100 transition-colors">
                Cancel
              </button>
              <button 
                onClick={submitInwardLog}
                disabled={isSubmitting || !weightInput || !scalePhoto}
                className="flex-[2] bg-indigo-600 text-white font-black py-3 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:bg-slate-400 flex justify-center items-center"
              >
                {isSubmitting ? <span className="animate-spin text-xl">⟳</span> : "Save to Ledger"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}