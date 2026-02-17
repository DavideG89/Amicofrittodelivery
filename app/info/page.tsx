'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Header } from '@/components/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MapPin, Phone, Clock } from 'lucide-react'
import Image from 'next/image'

interface StoreInfo {
  name: string
  address: string
  phone: string
  opening_hours: Record<string, string> | string | null
}

export default function InfoPage() {
  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchStoreInfo() {
      try {
        const { data, error } = await supabase
          .from('store_info')
          .select('*')
          .limit(1)
          .maybeSingle()

        if (error) throw error
        setStoreInfo(data)
      } catch (error) {
        console.error('[v0] Error fetching store info:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchStoreInfo()
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container py-8">
        <div className="max-w-3xl mx-auto space-y-8">
          {/* Logo e Nome */}
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <Image
                src="/logo.png"
                alt="Amico Fritto Logo"
                width={300}
                height={120}
                style={{ width: 'auto', height: 'auto', maxWidth: '300px' }}
                priority
              />
            </div>
            <h1 className="text-4xl font-bold text-balance">
              {storeInfo?.name || 'Amico Fritto'}
            </h1>
            <p className="text-lg text-muted-foreground">
              I migliori fritti della città
            </p>
          </div>

          {loading ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">Caricamento informazioni...</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6">
              {/* Indirizzo */}
              {storeInfo?.address && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MapPin className="h-5 w-5 text-primary" />
                      Dove Siamo
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-lg">{storeInfo.address}</p>
                  </CardContent>
                </Card>
              )}

              {/* Telefono */}
              {storeInfo?.phone && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Phone className="h-5 w-5 text-primary" />
                      Contatti
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <a 
                      href={`tel:${storeInfo.phone.replace(/\s/g, '')}`}
                      className="text-lg hover:text-primary transition-colors"
                    >
                      {storeInfo.phone}
                    </a>
                  </CardContent>
                </Card>
              )}

              {/* Orari */}
              {storeInfo?.opening_hours && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-primary" />
                      Orari di Apertura
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {typeof storeInfo.opening_hours === 'string' ? (
                        <div className="whitespace-pre-line text-lg">
                          {storeInfo.opening_hours}
                        </div>
                      ) : (
                        Object.entries(storeInfo.opening_hours).map(([day, hours]) => (
                          <div key={day} className="flex justify-between items-center">
                            <span className="font-medium capitalize">{day}:</span>
                            <span className="text-muted-foreground">{hours}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Informazioni su ordini */}
              <Card className="border-primary/20 bg-primary/5">
                <CardHeader>
                  <CardTitle>Come Ordinare</CardTitle>
                  <CardDescription>
                    Scegli tra delivery o takeaway
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-start gap-3">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold flex-shrink-0">
                      1
                    </div>
                    <p>Sfoglia il nostro menu e aggiungi i prodotti al carrello</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold flex-shrink-0">
                      2
                    </div>
                    <p>Scegli se vuoi il delivery a domicilio o il takeaway in negozio</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold flex-shrink-0">
                      3
                    </div>
                    <p>Inserisci i tuoi dati e completa l&apos;ordine</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold flex-shrink-0">
                      4
                    </div>
                    <p>Pagherai in contanti alla consegna o al ritiro</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
