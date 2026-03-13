import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Set cookies on the request for server components
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value, options)
          )
          // Create new response and set cookies on it
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session and get current user
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Paths that don't require authentication
  const publicPaths = ['/login', '/signup']
  const isPublicPath = publicPaths.some(path => request.nextUrl.pathname.startsWith(path))
  
  // Static assets and API routes that should be excluded
  const isStaticAsset = /\.(png|jpg|jpeg|gif|webp|svg|ico|css|js|woff|woff2|ttf|eot)$/i.test(request.nextUrl.pathname)
  const isApiRoute = request.nextUrl.pathname.startsWith('/api')
  
  // Skip protection for static assets and most API routes
  if (isStaticAsset || (isApiRoute && !request.nextUrl.pathname.startsWith('/api/admin'))) {
    return supabaseResponse
  }

  // Handle authentication redirects
  if (!user && !isPublicPath) {
    // Redirect to login if not authenticated
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirectedFrom', request.nextUrl.pathname)
    return NextResponse.redirect(url)
  }

  // Redirect authenticated users away from auth pages
  if (user && isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  // Admin route protection
  if (user && request.nextUrl.pathname.startsWith('/admin')) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      // Non-admin trying to access admin route - redirect to home
      const url = request.nextUrl.clone()
      url.pathname = '/'
      url.searchParams.set('error', 'unauthorized')
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - manifest.json (PWA manifest)
     * - icons/* (PWA icons)
     * - sw.js (service worker)
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|icons|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|eot)$).*)',
  ],
}
