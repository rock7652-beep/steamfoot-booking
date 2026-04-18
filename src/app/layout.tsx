import type { Metadata, Viewport } from 'next'
import { Toaster } from 'sonner'
import { NextAuthSessionProvider } from '@/components/session-provider-wrapper'
import './globals.css'

export const metadata: Metadata = {
  title: '蒸足預約管理系統',
  description: '蒸足店預約＋課程消費管理系統',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-TW">
      <body className="bg-white text-gray-900 antialiased min-h-screen flex flex-col">
        <NextAuthSessionProvider>
          <div className="flex-1">{children}</div>
          <Toaster position="top-center" richColors closeButton />
        </NextAuthSessionProvider>
      </body>
    </html>
  )
}
