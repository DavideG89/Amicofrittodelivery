'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Save } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface StoreInfo {
  id: string
  name: string
  address: string | null
  phone: string | null
  opening_hours: Record<string, string> | string | null
  delivery_fee: number
  min_order_delivery: number
  updated_at: string
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resettingOrders, setResettingOrders] = useState(false)
  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    phone: '',
    opening_hours: '',
    delivery_fee: '0',
    min_order_delivery: '0',
  })

  useEffect(() => {
    fetchStoreInfo()
  }, [])

  async function fetchStoreInfo() {
    try {
      const { data, error } = await supabase
        .from('store_info')
        .select('*')
        .limit(1)
        .maybeSingle()

      if (error) throw error

      if (data) {
        setStoreInfo(data)
        setFormData({
          name: data.name || '',
          address: data.address || '',
          phone: data.phone || '',
          opening_hours: typeof data.opening_hours === 'string' ? data.opening_hours : JSON.stringify(data.opening_hours || {}, null, 2),
          delivery_fee: data.delivery_fee?.toString() || '0',
          min_order_delivery: data.min_order_delivery?.toString() || '0',
        })
      }
    } catch (error) {
      console.error('[v0] Error fetching store info:', error)
      toast.error('Errore nel caricamento delle informazioni')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!formData.name.trim()) {
      toast.error('Il nome del locale è obbligatorio')
      return
    }

    setSaving(true)
    try {
      console.log('[v0] Saving store info:', formData)
      
      // Parse opening_hours if it's a JSON string
      let openingHours: Record<string, string> | null = null
      if (formData.opening_hours.trim()) {
        try {
          openingHours = JSON.parse(formData.opening_hours)
        } catch {
          // If not JSON, treat as plain text and convert to object
          openingHours = { info: formData.opening_hours.trim() }
        }
      }

      const dataToSave = {
        name: formData.name.trim(),
        address: formData.address.trim() || null,
        phone: formData.phone.trim() || null,
        opening_hours: openingHours,
        delivery_fee: parseFloat(formData.delivery_fee) || 0,
        min_order_delivery: parseFloat(formData.min_order_delivery) || 0,
      }

      if (storeInfo) {
        // Update existing
        const { error } = await supabase
          .from('store_info')
          .update(dataToSave)
          .eq('id', storeInfo.id)

        if (error) {
          console.error('[v0] Update error:', error)
          throw error
        }
        console.log('[v0] Store info updated successfully')
      } else {
        // Insert new
        const { error } = await supabase
          .from('store_info')
          .insert(dataToSave)

        if (error) {
          console.error('[v0] Insert error:', error)
          throw error
        }
        console.log('[v0] Store info inserted successfully')
      }

      toast.success('Informazioni salvate con successo')
      await fetchStoreInfo()
    } catch (error) {
      console.error('[v0] Error saving store info:', error)
      toast.error('Errore nel salvataggio delle informazioni')
    } finally {
      setSaving(false)
    }
  }

  async function handleResetOrders() {
    setResettingOrders(true)
    try {
      const { error } = await supabase
        .from('orders')
        .delete()
        .neq('id', '')

      if (error) throw error

      toast.success('Ordini azzerati con successo')
    } catch (error) {
      console.error('[v0] Error resetting orders:', error)
      toast.error('Errore durante l’azzeramento degli ordini')
    } finally {
      setResettingOrders(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Impostazioni</h1>
          <p className="text-muted-foreground">Caricamento...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Impostazioni</h1>
        <p className="text-muted-foreground">
          Gestisci le informazioni del tuo locale
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informazioni Locale</CardTitle>
          <CardDescription>
            Queste informazioni saranno visibili ai clienti nella pagina Info
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome Locale *</Label>
            <Input
              id="name"
              placeholder="Amico Fritto"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Indirizzo</Label>
            <Input
              id="address"
              placeholder="Via Roma 123, 00100 Roma"
              value={formData.address}
              onChange={(e) =>
                setFormData({ ...formData, address: e.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Numero di Telefono</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="+39 06 1234567"
              value={formData.phone}
              onChange={(e) =>
                setFormData({ ...formData, phone: e.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="opening_hours">Orari di Apertura (JSON)</Label>
            <Textarea
              id="opening_hours"
              placeholder='{"lunedi": "11:00-22:00", "martedi": "11:00-22:00"}'
              rows={4}
              value={formData.opening_hours}
              onChange={(e) =>
                setFormData({ ...formData, opening_hours: e.target.value })
              }
            />
            <p className="text-sm text-muted-foreground">
              Formato JSON: {`{"lunedi": "11:00-22:00", "martedi": "Chiuso"}`}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="delivery_fee">Costo Consegna (€)</Label>
              <Input
                id="delivery_fee"
                type="number"
                step="0.01"
                min="0"
                placeholder="3.50"
                value={formData.delivery_fee}
                onChange={(e) =>
                  setFormData({ ...formData, delivery_fee: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="min_order_delivery">Ordine Minimo Delivery (€)</Label>
              <Input
                id="min_order_delivery"
                type="number"
                step="0.01"
                min="0"
                placeholder="15.00"
                value={formData.min_order_delivery}
                onChange={(e) =>
                  setFormData({ ...formData, min_order_delivery: e.target.value })
                }
              />
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <Button onClick={handleSave} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Salvataggio...' : 'Salva Modifiche'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sicurezza</CardTitle>
          <CardDescription>
            Gestisci la password di accesso alla dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            La password è configurata tramite variabili d&apos;ambiente (NEXT_PUBLIC_ADMIN_PASSWORD).
            Per cambiarla, modifica la variabile d&apos;ambiente nel tuo progetto.
          </p>
          <div className="bg-muted p-4 rounded-lg">
            <code className="text-sm">NEXT_PUBLIC_ADMIN_PASSWORD=la_tua_password_sicura</code>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Azzeramento Dati Ordini</CardTitle>
          <CardDescription>
            Questa azione cancella tutti gli ordini e resetta incassi e contatori
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Usa questa funzione solo per ripulire dati di test. L’operazione è irreversibile.
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={resettingOrders}>
                {resettingOrders ? 'Azzeramento...' : 'Azzera ordini e incassi'}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confermi l’azzeramento?</AlertDialogTitle>
                <AlertDialogDescription>
                  Verranno cancellati tutti gli ordini. Questa azione non può essere annullata.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annulla</AlertDialogCancel>
                <AlertDialogAction onClick={handleResetOrders}>
                  Conferma azzeramento
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  )
}
