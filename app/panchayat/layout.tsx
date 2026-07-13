"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function PanchayatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  
  // 1. THE DETECTIVE: Check which role we are currently viewing
  const isBDO = pathname.includes("/bdo");
  const isHealth = pathname.includes("/health");
  const isGWMC = pathname.includes("/gwmc");
  
  // 2. THE ROUTER: Set the base path dynamically based on the exact role
  let basePath = "/panchayat"; // Default (Panchayat Secretary)
  if (isBDO) basePath = "/panchayat/bdo";
  if (isHealth) basePath = "/panchayat/health";
  if (isGWMC) basePath = "/panchayat/gwmc";

  // 3. THEME LOGIC: Set background, text colors, and titles based on role
  const bgColor = isBDO ? 'bg-blue-50/30' 
                : isHealth ? 'bg-emerald-50/30' 
                : isGWMC ? 'bg-indigo-50/30' 
                : 'bg-green-50/30';
                
  const titleColor = isBDO ? 'text-blue-500' 
                   : isHealth ? 'text-emerald-500' 
                   : isGWMC ? 'text-indigo-500' 
                   : 'text-green-500';
                   
  const subtitle = isBDO ? "Taluka BDO Console" 
                 : isHealth ? "Health Officer Console" 
                 : isGWMC ? "District GWMC Console" 
                 : "Village Panchayat Console";

  return (
    <div className={`flex h-screen ${bgColor}`}>
      
      <aside className="w-64 bg-slate-900 text-white flex flex-col z-20">
        <div className="p-6 border-b border-slate-800">
          <h1 className={`text-2xl font-bold tracking-wider ${titleColor}`}>
            GRIP : SWM
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {subtitle}
          </p>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {/* 4. DYNAMIC LINKS: Now basePath holds the correct URL for all 4 roles */}
          <Link
            href={`${basePath}`}
            className="block px-4 py-3 rounded-lg hover:bg-slate-800 transition"
          >
            📊 KPI Dashboard
          </Link>
          
          <Link
            href={`${basePath}/pending`}
            className="block px-4 py-3 rounded-lg hover:bg-slate-800 transition text-amber-400"
          >
            ⚠️ Active Hazards
          </Link>
          
          <Link
            href={`${basePath}/resolved`}
            className="block px-4 py-3 rounded-lg hover:bg-slate-800 transition text-emerald-400"
          >
            🧾 Audit & Receipts
          </Link>
          
          
          <Link
            href={`${basePath}/mrf`}
            className="block px-4 py-3 rounded-lg hover:bg-slate-800 transition"
          >
            🏭 Recovery Facility
          </Link>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}