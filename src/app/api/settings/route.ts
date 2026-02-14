import { createServerClient } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

// GET: Read all settings (uses user's auth)
export async function GET() {
    const cookieStore = await cookies()
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() { return cookieStore.getAll() },
                setAll() { },
            },
        }
    )

    // 1. Verify Admin
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()

    if (profile?.role !== 'admin') {
        return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    // 2. Read settings (using service_role to bypass RLS)
    const adminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data, error } = await adminClient
        .from('system_settings')
        .select('key, value')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ settings: data })
}

// POST: Save settings (admin only, uses service_role)
export async function POST(req: NextRequest) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() { return cookieStore.getAll() },
                setAll() { },
            },
        }
    )

    // 1. Verify Admin
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()

    if (profile?.role !== 'admin') {
        return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    // 2. Parse request body
    const { updates } = await req.json()
    // updates: Array<{ key: string, value: string }>

    if (!updates || !Array.isArray(updates)) {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    // 3. Write settings using service_role (bypasses RLS)
    const adminClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const upsertData = updates.map((u: any) => ({
        key: u.key,
        value: u.value,
        updated_at: new Date().toISOString()
    }))

    const { error } = await adminClient
        .from('system_settings')
        .upsert(upsertData)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
}
