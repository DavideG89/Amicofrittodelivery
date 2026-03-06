'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, ChevronDown, Eraser, MapPinned, Save, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  deliveryPolygonToJson,
  getDeliveryPolygonFromOpeningHours,
  isDeliveryPolygonReady,
  isPointInsideDeliveryPolygon,
  parseDeliveryPolygonInput,
  setDeliveryPolygonInOpeningHours,
  type DeliveryPoint,
} from '@/lib/delivery-area'
import { supabase, type StoreInfo } from '@/lib/supabase'

const DeliveryAreaMap = dynamic(() => import('./delivery-area-map'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[260px] w-full items-center justify-center rounded-lg border text-sm text-muted-foreground sm:h-[420px]">
      Caricamento mappa...
    </div>
  ),
})

const STORAGE_KEY = 'admin:delivery-area:polygon-v1'
const EXAMPLE_POLYGON: DeliveryPoint[] = [
  [38.036211, 13.448737],
  [38.036105, 13.454259],
  [38.032447, 13.454311],
  [38.032526, 13.448781],
]

const adminPages = [
  { href: '/admin/dashboard', label: 'Dashboard' },
  { href: '/admin/dashboard/orders', label: 'Ordini' },
  { href: '/admin/dashboard/menu', label: 'Menu' },
  { href: '/admin/dashboard/upsell', label: 'Upsell' },
  { href: '/admin/dashboard/discounts', label: 'Sconti' },
  { href: '/admin/dashboard/delivery-area', label: 'Area Delivery' },
  { href: '/admin/dashboard/settings', label: 'Impostazioni' },
]

export default function DeliveryAreaPage() {
  const router = useRouter()
  const [polygonText, setPolygonText] = useState('')
  const [testLat, setTestLat] = useState('')
  const [testLng, setTestLng] = useState('')
  const [testResult, setTestResult] = useState<boolean | null>(null)
  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null)
  const [saving, setSaving] = useState(false)

  const parsed = useMemo(() => parseDeliveryPolygonInput(polygonText), [polygonText])
  const mapPoints = parsed.points ?? []
  const polygonReady = isDeliveryPolygonReady(parsed.points)

  useEffect(() => {
    const draft = localStorage.getItem(STORAGE_KEY)
    if (draft) {
      setPolygonText(draft)
    }

    const fetchStoreInfo = async () => {
      const { data, error } = await supabase
        .from('store_info')
        .select('id, name, address, phone, opening_hours, delivery_fee, min_order_delivery, updated_at')
        .limit(1)
        .maybeSingle()

      if (error) {
        toast.error('Errore nel caricamento configurazione delivery')
        return
      }

      if (!data) {
        setPolygonText(deliveryPolygonToJson(EXAMPLE_POLYGON))
        return
      }

      setStoreInfo(data)
      const savedPolygon = getDeliveryPolygonFromOpeningHours(data.opening_hours)
      if (savedPolygon && savedPolygon.length > 0) {
        const savedJson = deliveryPolygonToJson(savedPolygon)
        setPolygonText(savedJson)
        localStorage.setItem(STORAGE_KEY, savedJson)
        return
      }

      if (!draft) {
        setPolygonText(deliveryPolygonToJson(EXAMPLE_POLYGON))
      }
    }

    void fetchStoreInfo()
  }, [])

  const handleSave = async () => {
    if (!storeInfo) {
      toast.error('Configura prima il locale in Impostazioni, poi salva l area delivery.')
      return
    }
    if (!parsed.points) {
      toast.error(parsed.error || 'Inserisci un poligono valido prima di salvare.')
      return
    }
    if (!isDeliveryPolygonReady(parsed.points)) {
      toast.error('Servono almeno 3 punti per creare un poligono.')
      return
    }

    setSaving(true)
    try {
      const nextOpeningHours = setDeliveryPolygonInOpeningHours(storeInfo.opening_hours, parsed.points)
      const { error } = await supabase
        .from('store_info')
        .update({ opening_hours: nextOpeningHours })
        .eq('id', storeInfo.id)

      if (error) throw error

      const normalized = deliveryPolygonToJson(parsed.points)
      setPolygonText(normalized)
      localStorage.setItem(STORAGE_KEY, normalized)
      setStoreInfo((prev) => (prev ? { ...prev, opening_hours: nextOpeningHours } : prev))
      toast.success('Area delivery salvata')
    } catch (error) {
      console.error('[delivery-area] Save error:', error)
      toast.error('Errore durante il salvataggio dell area delivery')
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async () => {
    if (!storeInfo) {
      localStorage.removeItem(STORAGE_KEY)
      setPolygonText('')
      setTestResult(null)
      return
    }

    setSaving(true)
    try {
      const nextOpeningHours = setDeliveryPolygonInOpeningHours(storeInfo.opening_hours, null)
      const { error } = await supabase
        .from('store_info')
        .update({ opening_hours: nextOpeningHours })
        .eq('id', storeInfo.id)

      if (error) throw error

      localStorage.removeItem(STORAGE_KEY)
      setPolygonText('')
      setTestResult(null)
      setStoreInfo((prev) => (prev ? { ...prev, opening_hours: nextOpeningHours } : prev))
      toast.success('Area delivery rimossa')
    } catch (error) {
      console.error('[delivery-area] Clear error:', error)
      toast.error('Errore durante la rimozione area delivery')
    } finally {
      setSaving(false)
    }
  }

  const handleLoadExample = () => {
    setPolygonText(deliveryPolygonToJson(EXAMPLE_POLYGON))
    setTestResult(null)
  }

  const handleAddMapPoint = (point: DeliveryPoint) => {
    const next = [...mapPoints, point]
    setPolygonText(deliveryPolygonToJson(next))
    setTestResult(null)
  }

  const handleUndoLastPoint = () => {
    if (mapPoints.length === 0) return
    const next = mapPoints.slice(0, -1)
    setPolygonText(next.length === 0 ? '' : deliveryPolygonToJson(next))
    setTestResult(null)
  }

  const handleVerifyPoint = () => {
    if (!parsed.points) {
      toast.error(parsed.error || 'Inserisci un poligono valido prima del test.')
      return
    }
    if (!isDeliveryPolygonReady(parsed.points)) {
      toast.error('Servono almeno 3 punti per verificare il punto cliente.')
      return
    }

    const lat = Number(testLat)
    const lng = Number(testLng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      toast.error('Inserisci latitudine e longitudine valide.')
      return
    }

    setTestResult(isPointInsideDeliveryPolygon([lat, lng], parsed.points))
  }

  return (
    <div className="p-6 space-y-6 bg-muted/30">
      <div>
        <div className="md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger className="text-left">
              <h1 className="inline-flex items-center gap-2 text-3xl font-bold">
                Area Delivery
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
        <h1 className="hidden md:block text-3xl font-bold">Area Delivery</h1>
        <p className="text-muted-foreground">Configura il perimetro di consegna per applicare il blocco ordini fuori zona.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPinned className="h-5 w-5" />
            Poligono di consegna
          </CardTitle>
          <CardDescription>Clicca sulla mappa per aggiungere i vertici. Questa configurazione viene salvata per tutti gli utenti.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <DeliveryAreaMap points={mapPoints} onAddPoint={handleAddMapPoint} />

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={handleUndoLastPoint} disabled={mapPoints.length === 0}>
              <Undo2 className="mr-2 h-4 w-4" />
              Annulla ultimo punto
            </Button>
            <span className="text-sm text-muted-foreground">Vertici attuali: {mapPoints.length}</span>
          </div>

          <div className="space-y-2">
            <Label htmlFor="delivery-polygon">Coordinate area</Label>
            <Textarea
              id="delivery-polygon"
              rows={12}
              value={polygonText}
              onChange={(event) => setPolygonText(event.target.value)}
              placeholder={'{\n  "polygon": [[38.03,13.45],[38.03,13.46],[38.02,13.45]]\n}'}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void handleSave()} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Salvataggio...' : 'Salva area delivery'}
            </Button>
            <Button variant="outline" onClick={handleLoadExample} disabled={saving}>
              Carica esempio
            </Button>
            <Button variant="outline" onClick={() => void handleClear()} disabled={saving}>
              <Eraser className="mr-2 h-4 w-4" />
              Rimuovi area
            </Button>
          </div>

          <div className="text-sm">
            {parsed.error ? (
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" />
                <span>{parsed.error}</span>
              </div>
            ) : polygonReady ? (
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                <span>Poligono valido con {mapPoints.length} vertici</span>
              </div>
            ) : mapPoints.length > 0 ? (
              <div className="flex items-center gap-2 text-amber-700">
                <AlertTriangle className="h-4 w-4" />
                <span>Aggiungi almeno 3 punti per completare il poligono.</span>
              </div>
            ) : (
              <span className="text-muted-foreground">Inserisci il poligono per iniziare.</span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Test punto cliente</CardTitle>
          <CardDescription>Verifica rapidamente se un punto cade dentro il poligono.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="test-lat">Latitudine</Label>
              <Input
                id="test-lat"
                value={testLat}
                onChange={(event) => setTestLat(event.target.value)}
                placeholder="38.0340"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="test-lng">Longitudine</Label>
              <Input
                id="test-lng"
                value={testLng}
                onChange={(event) => setTestLng(event.target.value)}
                placeholder="13.4510"
              />
            </div>
          </div>

          <Button variant="secondary" onClick={handleVerifyPoint}>
            Verifica punto
          </Button>

          {testResult !== null && (
            <div>
              {testResult ? (
                <Badge className="bg-emerald-600 hover:bg-emerald-600">Dentro area delivery</Badge>
              ) : (
                <Badge variant="destructive">Fuori area delivery</Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
