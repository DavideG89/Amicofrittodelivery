'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
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
import {
  buildOpeningHoursValue,
  createEmptySchedule,
  dayLabels,
  extractOpeningHours,
  normalizeSchedule,
  type DayKey,
  type OrderSchedule,
} from '@/lib/order-schedule'

interface StoreInfo {
  id: string
  name: string
  address: string | null
  phone: string | null
  opening_hours: import('@/lib/order-schedule').OpeningHoursValue
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
  const [orderSchedule, setOrderSchedule] = useState<OrderSchedule>(createEmptySchedule())

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
        const { display, schedule } = extractOpeningHours(data.opening_hours)
        setFormData({
          name: data.name || '',
          address: data.address || '',
          phone: data.phone || '',
          opening_hours:
            typeof display === 'string'
              ? display
              : JSON.stringify(display || {}, null, 2),
          delivery_fee: data.delivery_fee?.toString() || '0',
          min_order_delivery: data.min_order_delivery?.toString() || '0',
        })
        setOrderSchedule(schedule ?? createEmptySchedule())
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
      
      // Parse opening_hours display if it's a JSON string
      let openingHoursDisplay: Record<string, string> | string | null = null
      if (formData.opening_hours.trim()) {
        try {
          openingHoursDisplay = JSON.parse(formData.opening_hours)
        } catch {
          // If not JSON, treat as plain text
          openingHoursDisplay = formData.opening_hours.trim()
        }
      }

      const cleanedSchedule = normalizeSchedule(orderSchedule)
      const openingHours = buildOpeningHoursValue(openingHoursDisplay, cleanedSchedule)

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

  const updateRange = (day: DayKey, index: number, field: 'start' | 'end', value: string) => {
    setOrderSchedule((prev) => {
      const next = { ...prev, days: { ...prev.days, [day]: [...prev.days[day]] } }
      next.days[day][index] = { ...next.days[day][index], [field]: value }
      return next
    })
  }

  const addRange = (day: DayKey) => {
    setOrderSchedule((prev) => ({
      ...prev,
      days: { ...prev.days, [day]: [...prev.days[day], { start: '', end: '' }] },
    }))
  }

  const removeRange = (day: DayKey, index: number) => {
    setOrderSchedule((prev) => ({
      ...prev,
      days: { ...prev.days, [day]: prev.days[day].filter((_, i) => i !== index) },
    }))
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

          <div className="space-y-4 rounded-lg border p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label>Programmazione Ordini</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Se attiva, gli ordini sono accettati solo negli orari indicati.
                </p>
              </div>
              <Switch
                checked={orderSchedule.enabled}
                onCheckedChange={(checked) =>
                  setOrderSchedule((prev) => ({ ...prev, enabled: checked }))
                }
              />
            </div>

            <div className="space-y-3">
              {(Object.keys(dayLabels) as DayKey[]).map((day) => (
                <div key={day} className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{dayLabels[day]}</span>
                    <Button type="button" variant="outline" size="sm" onClick={() => addRange(day)}>
                      Aggiungi fascia
                    </Button>
                  </div>
                  {orderSchedule.days[day].length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nessuna fascia impostata.</p>
                  ) : (
                    <div className="space-y-2">
                      {orderSchedule.days[day].map((range, index) => (
                        <div key={`${day}-${index}`} className="flex flex-wrap items-center gap-2">
                          <Input
                            type="time"
                            value={range.start}
                            onChange={(e) => updateRange(day, index, 'start', e.target.value)}
                            className="w-32"
                          />
                          <span className="text-sm text-muted-foreground">-</span>
                          <Input
                            type="time"
                            value={range.end}
                            onChange={(e) => updateRange(day, index, 'end', e.target.value)}
                            className="w-32"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeRange(day, index)}
                          >
                            Rimuovi
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
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
