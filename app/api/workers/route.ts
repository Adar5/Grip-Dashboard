import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // 1. AUTHENTICATE THE USER
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll() { return cookieStore.getAll(); } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user || !user.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const safeUserEmail = user.email.trim().toLowerCase();
    
    // 2. IDENTIFY THEIR ROLE & JURISDICTION
    const { data: allDepts } = await supabase.from("departments").select("*");
    const aeDept = allDepts?.find((d: any) => d.contact_email && d.contact_email.trim().toLowerCase() === safeUserEmail);

    let role = 'JE';
    let eeDistrict: string | null = null;
    let myDeptId: any = aeDept?.id;

    if (aeDept) {
      role = 'AE';
    } else {
      const { data: worker } = await supabase.from("field_workers").select("*").ilike("email", safeUserEmail).single();
      if (worker) {
        if (worker.hierarchy_level === 5) {
          role = 'CE'; // Chief Engineer
        } else if (worker.hierarchy_level === 4) {
          role = 'EE'; // Executive Engineer
          eeDistrict = worker.specialty.includes("North") ? "North Goa" : "South Goa";
        } else {
          role = 'JE'; // Junior Engineer
          myDeptId = worker.department_id;
        }
      } else {
         return NextResponse.json({ success: false, error: "Profile not found." }, { status: 403 });
      }
    }

    // 3. BUILD THE DYNAMIC SQL QUERY BASED ON ROLE
    let roleFilter = "";
    const queryParams: any[] = [];

    if (role === 'CE') {
      // CE sees all PWD workers across the state (No extra filter)
      roleFilter = "";
    } else if (role === 'EE') {
      // EE sees all workers within their specific District
      roleFilter = "AND d.district = $1";
      queryParams.push(eeDistrict);
    } else if (role === 'AE' || role === 'JE') {
      // AE and JE strictly see workers belonging to their specific department/office
      roleFilter = "AND d.id = $1";
      queryParams.push(myDeptId);
    }

    const query = `
      SELECT 
        f.id as worker_id,
        f.worker_name,
        f.specialty,
        f.phone_number,
        f.is_available,
        d.department_name,
        d.taluka_name,
        -- Count how many unresolved tasks this specific worker has right now
        COUNT(w.id) FILTER (WHERE w.status != 'Resolved' AND w.status != 'Completed') as active_tasks
      FROM field_workers f
      -- 1. Updated to the new 'departments' table and 'department_id' foreign key
      JOIN departments d ON f.department_id = d.id
      LEFT JOIN work_orders w ON w.worker_id = f.id
      -- 2. Strictly filter out the Village Panchayat workers!
      WHERE d.department_type = 'PWD_DIVISION'
      ${roleFilter}
      GROUP BY f.id, d.department_name, d.taluka_name
      ORDER BY d.taluka_name ASC, f.worker_name ASC;
    `;
    
    // Execute query securely with parameterized values
    const result = await pool.query(query, queryParams);
    
    return NextResponse.json({ success: true, role: role, workers: result.rows });
    
  } catch (error: any) {
    console.error("Workers API Error:", error);
    return NextResponse.json({ success: false, error: error.message || "Database fetch failed" }, { status: 500 });
  }
}