"use client";

import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";

// --- INTERFACES ---
interface DispatchRequest {
  id: string;
  created_at: string;
  panchayat_name: string;
  district: string; // 'North Goa' or 'South Goa'
  declared_weight_kg: number;
  gwmc_weight_kg: number | null;
  status: string; // 'Pending GWMC', 'Verified', 'Flagged'
}

export default function GWMCAuditDashboard() {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<DispatchRequest[]>([]);
  const [regionFilter, setRegionFilter] = useState<string>("All"); // 'All', 'North Goa', 'South Goa'

  // Modal States
  const [selectedRequest, setSelectedRequest] = useState<DispatchRequest | null>(null);
  const [actualWeightInput, setActualWeightInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. FETCH PENDING AND RECENT DISPATCHES
  const fetchDispatches = async () => {
    setLoading(true);
    try {
      // In a real app, you would filter this by the logged-in GWMC user's region
      const { data, error } = await supabase
        .from('mrf_outward')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      console.error("Failed to load dispatches:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDispatches();
  }, []);

  // 2. CALCULATE VARIANCE
  // Returns { percentage, isFlagged }
  const calculateVariance = (claimed: number, actual: number) => {
    if (!actual) return { percentage: 0, isFlagged: false };
    const variance = ((actual - claimed) / claimed) * 100;
    const isFlagged = Math.abs(variance) > 5; // Flag if difference is strictly > 5%
    return { percentage: variance, isFlagged };
  };

  // 3. SUBMIT GWMC AUDIT
  const submitAudit = async () => {
    if (!selectedRequest || !actualWeightInput) return;
    setIsSubmitting(true);

    const actualWeight = parseFloat(actualWeightInput);
    const { isFlagged } = calculateVariance(selectedRequest.declared_weight_kg, actualWeight);
    const finalStatus = isFlagged ? 'Flagged' : 'Verified';

    try {
      const { error } = await supabase
        .from('mrf_outward')
        .update({
          gwmc_weight_kg: actualWeight,
          status: finalStatus,
          // You could also record the exact timestamp of arrival here
        })
        .eq('id', selectedRequest.id);

      if (error) throw error;

      alert(`Load marked as ${finalStatus.toUpperCase()}`);
      setSelectedRequest(null);
      setActualWeightInput("");
      fetchDispatches(); // Refresh the table
    } catch (error) {
      console.error("Audit failed:", error);
      alert("Failed to submit audit.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter Data
  const filteredRequests = regionFilter === "All" 
    ? requests 
    : requests.filter(r => r.district === regionFilter);

  // Stats
  const pendingCount = filteredRequests.filter(r => r.status === 'Pending GWMC').length;
  const flaggedCount = filteredRequests.filter(r => r.status === 'Flagged').length;

  return (
    <div className="min-h-screen bg-slate-50/50 p-6 lg:p-10">
      
      {/* HEADER & FILTERS */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">GWMC Plant Receiving</h1>
          <p className="text-slate-500 mt-1 font-medium">Verify incoming Panchayat MRF trucks and audit payload weights.</p>
        </div>
        
        <div className="flex bg-white rounded-xl shadow-sm border border-slate-200 p-1 mt-4 md:mt-0">
          {['All', 'North Goa', 'South Goa'].map(region => (
            <button
              key={region}
              onClick={() => setRegionFilter(region)}
              className={`px-4 py-2 rounded-lg font-bold text-sm transition-colors ${
                regionFilter === region 
                  ? 'bg-indigo-600 text-white' 
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {region}
            </button>
          ))}
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 border-l-4 border-l-amber-500">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">Inbound Trucks</h3>
          <p className="text-4xl font-black text-slate-800">{pendingCount}</p>
          <p className="text-xs font-bold text-amber-600 mt-2">Awaiting Plant Weigh-in</p>
        </div>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 border-l-4 border-l-red-500">
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">Discrepancies Flagged</h3>
          <p className="text-4xl font-black text-slate-800">{flaggedCount}</p>
          <p className="text-xs font-bold text-red-600 mt-2">&gt; 5% Weight Variance Detected</p>
        </div>
      </div>

      {/* DISPATCH TABLE */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-[600px]">
        <div className="p-5 border-b border-slate-100 bg-slate-50">
          <h2 className="text-lg font-bold text-slate-800">Dispatch Log ({regionFilter})</h2>
        </div>
        
        <div className="overflow-y-auto flex-1 p-0">
          {loading ? (
            <div className="flex justify-center items-center h-40">
              <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : filteredRequests.length === 0 ? (
            <p className="text-center text-slate-400 mt-10 font-medium">No dispatches found for this region.</p>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead className="bg-white sticky top-0 shadow-sm z-10">
                <tr className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
                  <th className="p-4 border-b border-slate-100">Date</th>
                  <th className="p-4 border-b border-slate-100">Origin Panchayat</th>
                  <th className="p-4 border-b border-slate-100 text-right">Claimed Load</th>
                  <th className="p-4 border-b border-slate-100 text-right">GWMC Audit</th>
                  <th className="p-4 border-b border-slate-100 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredRequests.map(req => {
                  const isPending = req.status === 'Pending GWMC';
                  const isFlagged = req.status === 'Flagged';

                  return (
                    <tr key={req.id} className={`hover:bg-slate-50 transition-colors ${isFlagged ? 'bg-red-50/40' : ''}`}>
                      <td className="p-4 text-sm text-slate-600 font-bold">
                        {new Date(req.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-slate-800">{req.panchayat_name}</div>
                        <div className="text-xs text-slate-400">{req.district}</div>
                      </td>
                      <td className="p-4 text-right">
                        <span className="font-bold text-slate-600 bg-slate-100 px-2 py-1 rounded">
                          {req.declared_weight_kg.toLocaleString()} kg
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        {isPending ? (
                          <span className="text-xs font-bold text-amber-500 italic">Awaiting Truck...</span>
                        ) : (
                          <div>
                            <div className={`font-black ${isFlagged ? 'text-red-600' : 'text-emerald-600'}`}>
                              {req.gwmc_weight_kg?.toLocaleString()} kg
                            </div>
                            <div className={`text-[10px] font-bold mt-1 ${isFlagged ? 'text-red-500' : 'text-slate-400'}`}>
                              {calculateVariance(req.declared_weight_kg, req.gwmc_weight_kg!).percentage > 0 ? '+' : ''}
                              {calculateVariance(req.declared_weight_kg, req.gwmc_weight_kg!).percentage.toFixed(1)}% diff
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="p-4 text-center">
                        {isPending ? (
                          <button
                            onClick={() => setSelectedRequest(req)}
                            className="bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white font-bold px-4 py-2 rounded-lg text-xs transition-colors"
                          >
                            Enter Weight
                          </button>
                        ) : (
                          <span className={`text-[10px] font-black px-2 py-1 rounded uppercase ${isFlagged ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {req.status}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* --- AUDIT MODAL --- */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="bg-indigo-600 p-5 text-white flex justify-between items-center">
              <div>
                <h3 className="font-black text-xl">Weighbridge Audit</h3>
                <p className="text-indigo-200 text-xs font-medium">Truck from {selectedRequest.panchayat_name}</p>
              </div>
              <button onClick={() => setSelectedRequest(null)} className="text-indigo-200 hover:text-white font-black text-xl">✕</button>
            </div>
            
            <div className="p-6 space-y-5">
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex justify-between items-center">
                <span className="text-xs font-bold text-slate-500 uppercase">Claimed Weight</span>
                <span className="font-black text-lg text-slate-800">{selectedRequest.declared_weight_kg.toLocaleString()} kg</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Actual GWMC Plant Weight *
                </label>
                <div className="relative">
                  <input 
                    type="number" 
                    value={actualWeightInput}
                    onChange={(e) => setActualWeightInput(e.target.value)}
                    placeholder="Enter scale reading..."
                    className="w-full pl-4 pr-12 py-3 border-2 border-slate-200 rounded-xl font-bold text-slate-800 focus:border-indigo-500 outline-none transition-colors text-lg"
                    autoFocus
                  />
                  <span className="absolute right-4 top-3.5 text-slate-400 font-bold">kg</span>
                </div>
              </div>

              {/* LIVE VARIANCE CALCULATOR UI */}
              {actualWeightInput && (
                <div className={`p-4 rounded-xl border ${
                  calculateVariance(selectedRequest.declared_weight_kg, parseFloat(actualWeightInput)).isFlagged 
                    ? 'bg-red-50 border-red-200' 
                    : 'bg-emerald-50 border-emerald-200'
                }`}>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-600">Variance Detection:</span>
                    <span className={`font-black ${
                      calculateVariance(selectedRequest.declared_weight_kg, parseFloat(actualWeightInput)).isFlagged 
                        ? 'text-red-600' 
                        : 'text-emerald-600'
                    }`}>
                      {calculateVariance(selectedRequest.declared_weight_kg, parseFloat(actualWeightInput)).percentage.toFixed(2)}%
                    </span>
                  </div>
                  {calculateVariance(selectedRequest.declared_weight_kg, parseFloat(actualWeightInput)).isFlagged && (
                    <p className="text-[10px] font-bold text-red-500 mt-2 uppercase flex items-center gap-1">
                      ⚠️ Exceeds 5% tolerance threshold. Will be flagged.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="p-5 border-t border-slate-100 bg-slate-50 flex gap-3">
              <button 
                onClick={() => setSelectedRequest(null)} 
                className="flex-1 bg-white border-2 border-slate-200 text-slate-700 font-bold py-3 rounded-xl hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={submitAudit}
                disabled={isSubmitting || !actualWeightInput}
                className="flex-[2] bg-indigo-600 text-white font-black py-3 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:bg-slate-400 flex justify-center items-center"
              >
                {isSubmitting ? <span className="animate-spin text-xl">⟳</span> : "Verify & Save Log"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}