'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, QrCode as QrCodeIcon, ChevronDown } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import QRCode from 'qrcode'
import { toast } from 'sonner'

export default function QRCodePage() {
  const router = useRouter()
  const [qrCodeUrl, setQrCodeUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const adminPages = [
    { href: '/admin/dashboard', label: 'Dashboard' },
    { href: '/admin/dashboard/orders', label: 'Ordini' },
    { href: '/admin/dashboard/menu', label: 'Menu' },
    { href: '/admin/dashboard/upsell', label: 'Upsell' },
    { href: '/admin/dashboard/discounts', label: 'Sconti' },
    { href: '/admin/dashboard/settings', label: 'Impostazioni' },
  ]

  useEffect(() => {
    generateQRCode()
  }, [])

  async function generateQRCode() {
    setLoading(true)
    try {
      // Get the current site URL
      const siteUrl = window.location.origin
      
      if (!canvasRef.current) return

      // Generate QR code
      await QRCode.toCanvas(canvasRef.current, siteUrl, {
        width: 400,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      })

      // Convert to data URL for download
      const dataUrl = canvasRef.current.toDataURL('image/png')
      setQrCodeUrl(dataUrl)
    } catch (error) {
      console.error('[v0] Error generating QR code:', error)
      toast.error('Errore nella generazione del QR code')
    } finally {
      setLoading(false)
    }
  }

  function handleDownload() {
    if (!qrCodeUrl) return

    const link = document.createElement('a')
    link.download = 'amico-fritto-qr-code.png'
    link.href = qrCodeUrl
    link.click()
    toast.success('QR Code scaricato con successo')
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger className="text-left">
              <h1 className="inline-flex items-center gap-2 text-3xl font-bold">
                QR Code
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              </h1>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {adminPages.map((page) => (
                <DropdownMenuItem key={page.href} onSelect={() => router.push(page.href)}>
                  {page.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <h1 className="hidden md:block text-3xl font-bold">QR Code</h1>
        <p className="text-muted-foreground">
          Genera e scarica il QR code per il tuo ristorante
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>QR Code per Ordini</CardTitle>
            <CardDescription>
              I clienti possono scansionare questo QR code per accedere al menu e ordinare
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center h-[400px]">
                <p className="text-muted-foreground">Generazione QR code...</p>
              </div>
            ) : (
              <>
                <div className="flex justify-center bg-white p-6 rounded-lg">
                  <canvas ref={canvasRef} />
                </div>
                <div className="flex justify-center">
                  <Button onClick={handleDownload} size="lg">
                    <Download className="mr-2 h-4 w-4" />
                    Scarica QR Code
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Come Usare il QR Code</CardTitle>
            <CardDescription>
              Istruzioni per utilizzare il QR code nel tuo locale
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold flex-shrink-0 mt-1">
                  1
                </div>
                <div>
                  <p className="font-medium">Scarica il QR Code</p>
                  <p className="text-sm text-muted-foreground">
                    Clicca sul pulsante per scaricare l&apos;immagine del QR code
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold flex-shrink-0 mt-1">
                  2
                </div>
                <div>
                  <p className="font-medium">Stampa il QR Code</p>
                  <p className="text-sm text-muted-foreground">
                    Stampa il QR code su carta o cartoncino resistente
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold flex-shrink-0 mt-1">
                  3
                </div>
                <div>
                  <p className="font-medium">Posiziona nei Punti Strategici</p>
                  <p className="text-sm text-muted-foreground">
                    Metti il QR code sui tavoli, alla cassa, in vetrina o all&apos;ingresso
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold flex-shrink-0 mt-1">
                  4
                </div>
                <div>
                  <p className="font-medium">I Clienti Scannerizzano</p>
                  <p className="text-sm text-muted-foreground">
                    I clienti usano la fotocamera del telefono per scansionare e ordinare
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-muted p-4 rounded-lg mt-6">
              <div className="flex items-start gap-2">
                <QrCodeIcon className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">Suggerimento</p>
                  <p className="text-sm text-muted-foreground">
                    Assicurati che il QR code sia abbastanza grande (almeno 5x5 cm) e ben visibile per una scansione facile
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Link Diretto</CardTitle>
          <CardDescription>
            Condividi questo link per accedere al menu
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-muted px-4 py-2 rounded text-sm">
              {typeof window !== 'undefined' ? window.location.origin : ''}
            </code>
            <Button
              variant="outline"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  navigator.clipboard.writeText(window.location.origin)
                  toast.success('Link copiato negli appunti')
                }
              }}
            >
              Copia
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
