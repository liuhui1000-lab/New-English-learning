import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

// Helper: Create admin client (service_role, bypasses RLS)
function createAdminClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
}

// Helper: Verify admin from Bearer token
async function verifyAdmin(req: Request) {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
        return { error: 'Unauthorized: Missing token', status: 401 }
    }

    const token = authHeader.replace('Bearer ', '')
    const adminClient = createAdminClient()

    const { data: { user }, error } = await adminClient.auth.getUser(token)
    if (error || !user) {
        return { error: 'Unauthorized: Invalid token', status: 401 }
    }

    const { data: profile } = await adminClient
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (profile?.role !== 'admin') {
        return { error: 'Forbidden: Admin only', status: 403 }
    }

    return { user, profile }
}

// POST: Reset a user's password (admin only)
export async function POST(req: NextRequest) {
    const authResult = await verifyAdmin(req)

    if ('error' in authResult) {
        return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }

    const { userId, newPassword } = await req.json()
    if (!userId || !newPassword) {
        return NextResponse.json({ error: 'Missing userId or newPassword' }, { status: 400 })
    }

    if (newPassword.length < 6) {
        return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const adminClient = createAdminClient()

    const { error } = await adminClient.auth.admin.updateUserById(
        userId,
        { password: newPassword }
    )

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
}
