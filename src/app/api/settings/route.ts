import { createServerClient } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

// Helper: Create authenticated Supabase client (same pattern as ai/analyze)
async function createAuthClient() {
    const cookieStore = await cookies()
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        )
                    } catch {
                        // Ignored in Server Component context
                    }
                },
            },
        }
    )
}

// Helper: Verify admin role
async function verifyAdmin(supabase: any) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { error: 'Unauthorized', status: 401 }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single()

    if (profile?.role !== 'admin') {
        return { error: 'Admin only', status: 403 }
    }

    return { session, profile }
}

// GET: Read all settings
export async function GET() {
    const supabase = await createAuthClient()
    const authResult = await verifyAdmin(supabase)

    if ('error' in authResult) {
        return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    // Use service_role to bypass RLS
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

// POST: Save settings (admin only)
export async function POST(req: NextRequest) {
    const supabase = await createAuthClient()
    const authResult = await verifyAdmin(supabase)

    if ('error' in authResult) {
        return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    // Parse request body
    const { updates } = await req.json()
    if (!updates || !Array.isArray(updates)) {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    // Write using service_role (bypasses RLS)
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

