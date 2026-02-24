'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Trash2, Plus, Percent, ChevronDown } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

interface DiscountCode {
  id: string
  code: string
  discount_type: 'percentage' | 'fixed'
  discount_value: number
  min_order_amount: number
  active: boolean
  valid_from: string
  valid_until: string | null
  created_at: string
}

export default function DiscountsPage() {
  const router = useRouter()
  const [discounts, setDiscounts] = useState<DiscountCode[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [newPercent, setNewPercent] = useState('')
  const adminPages = [
    { href: '/admin/dashboard', label: 'Dashboard' },
    { href: '/admin/dashboard/orders', label: 'Ordini' },
    { href: '/admin/dashboard/menu', label: 'Menu' },
    { href: '/admin/dashboard/upsell', label: 'Upsell' },
    { href: '/admin/dashboard/discounts', label: 'Sconti' },
    { href: '/admin/dashboard/settings', label: 'Impostazioni' },
  ]

  useEffect(() => {
    fetchDiscounts()
  }, [])

  async function fetchDiscounts() {
    try {
      const { data, error } = await supabase
        .from('discount_codes')
        .select('id, code, discount_type, discount_value, min_order_amount, active, valid_from, valid_until, created_at')
        .order('created_at', { ascending: false })

      if (error) throw error
      setDiscounts(data || [])
    } catch (error) {
      console.error('[v0] Error fetching discounts:', error)
      toast.error('Errore nel caricamento dei codici sconto')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateDiscount() {
    if (!newCode.trim()) {
      toast.error('Inserisci un codice sconto')
      return
    }

    const percent = parseFloat(newPercent)
    if (isNaN(percent) || percent <= 0 || percent > 100) {
      toast.error('Inserisci una percentuale valida (1-100)')
      return
    }

    try {
      
      const { error } = await supabase
        .from('discount_codes')
        .insert({
          code: newCode.toUpperCase().trim(),
          discount_type: 'percentage',
          discount_value: percent,
          min_order_amount: 0,
          active: true,
        })

      if (error) {
        console.error('[v0] Discount creation error:', error)
        throw error
      }

      toast.success('Codice sconto creato con successo')
      setNewCode('')
      setNewPercent('')
      setDialogOpen(false)
      await fetchDiscounts()
    } catch (error: any) {
      console.error('[v0] Error creating discount:', error)
      if (error.code === '23505') {
        toast.error('Questo codice sconto esiste già')
      } else {
        toast.error('Errore nella creazione del codice sconto')
      }
    }
  }

  async function handleToggleActive(id: string, currentStatus: boolean) {
    try {
      const { error } = await supabase
        .from('discount_codes')
        .update({ active: !currentStatus })
        .eq('id', id)

      if (error) throw error

      toast.success(currentStatus ? 'Codice disattivato' : 'Codice attivato')
      await fetchDiscounts()
    } catch (error) {
      console.error('[v0] Error toggling discount:', error)
      toast.error('Errore nell\'aggiornamento del codice')
    }
  }

  async function handleDeleteDiscount(id: string) {
    if (!confirm('Sei sicuro di voler eliminare questo codice sconto?')) {
      return
    }

    try {
      const { error } = await supabase
        .from('discount_codes')
        .delete()
        .eq('id', id)

      if (error) throw error

      toast.success('Codice sconto eliminato')
      fetchDiscounts()
    } catch (error) {
      console.error('[v0] Error deleting discount:', error)
      toast.error('Errore nell\'eliminazione del codice')
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <div className="md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger className="text-left">
                <h1 className="inline-flex items-center gap-2 text-3xl font-bold">
                  Codici Sconto
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
          <h1 className="hidden md:block text-3xl font-bold">Codici Sconto</h1>
          <p className="text-muted-foreground">Caricamento...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger className="text-left">
                <h1 className="inline-flex items-center gap-2 text-3xl font-bold">
                  Codici Sconto
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
          <h1 className="hidden md:block text-3xl font-bold">Codici Sconto</h1>
          <p className="text-muted-foreground">
            Gestisci i codici sconto per i tuoi clienti
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              Nuovo Codice
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crea Codice Sconto</DialogTitle>
              <DialogDescription>
                Crea un nuovo codice sconto che i clienti potranno usare
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="code">Codice</Label>
                <Input
                  id="code"
                  placeholder="es. ESTATE2026"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                  maxLength={20}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="percent">Percentuale di Sconto (%)</Label>
                <Input
                  id="percent"
                  type="number"
                  placeholder="es. 10"
                  min="1"
                  max="100"
                  value={newPercent}
                  onChange={(e) => setNewPercent(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Annulla
              </Button>
              <Button onClick={handleCreateDiscount}>Crea Codice</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Codici Attivi</CardTitle>
          <CardDescription>
            Elenco di tutti i codici sconto creati
          </CardDescription>
        </CardHeader>
        <CardContent>
          {discounts.length === 0 ? (
            <div className="text-center py-8">
              <Percent className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                Nessun codice sconto disponibile.
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Crea il primo codice per iniziare.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Codice</TableHead>
                  <TableHead>Sconto</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Data Creazione</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {discounts.map((discount) => (
                  <TableRow key={discount.id}>
                    <TableCell className="font-mono font-bold">
                      {discount.code}
                    </TableCell>
                    <TableCell>
                      {discount.discount_type === 'percentage' 
                        ? `${discount.discount_value}%` 
                        : `${discount.discount_value.toFixed(2)}€`
                      }
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={discount.active ? 'default' : 'secondary'}
                        className="cursor-pointer"
                        onClick={() =>
                          handleToggleActive(discount.id, discount.active)
                        }
                      >
                        {discount.active ? 'Attivo' : 'Non Attivo'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(discount.created_at).toLocaleDateString('it-IT')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteDiscount(discount.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
