import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll(); } } }
  );

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Get the worker's village
    const { data: worker } = await supabase
      .from('field_workers')
      .select('departments(department_name)')
      .eq('auth_user_id', user.id)
      .single();

    const myPanchayat = worker?.departments?.department_name;
    if (!myPanchayat) return NextResponse.json({ error: 'No village assigned' }, { status: 400 });

    // Fetch Inward/Outward
    const [inward, outward] = await Promise.all([
      supabase.from("mrf_inward").select("*").eq("panchayat_name", myPanchayat),
      supabase.from("mrf_outward").select("*").eq("panchayat_name", myPanchayat)
    ]);

    return NextResponse.json({ 
      success: true,
      jurisdiction: myPanchayat, 
      inward: inward.data || [], 
      outward: outward.data || [] 
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}