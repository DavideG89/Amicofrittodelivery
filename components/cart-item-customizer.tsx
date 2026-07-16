'use client'

import { useEffect, useMemo, useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Separator } from '@/components/ui/separator'
import { useIsMobile } from '@/components/ui/use-mobile'
import { CartItem, getCartItemKey, useCart } from '@/lib/cart-context'
import { OrderAddition, ProductIngredient, supabase } from '@/lib/supabase'
import { DEFAULT_SAUCE_RULE, getFallbackSauceRuleByCategorySlug, normalizeSauceRule, SauceRule } from '@/lib/sauce-rules'
import { toast } from 'sonner'

type CartItemCustomizerProps = {
  item: CartItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CartItemCustomizer({ item, open, onOpenChange }: CartItemCustomizerProps) {
  const isMobile = useIsMobile()
  const { replaceItem } = useCart()
  const [ingredients, setIngredients] = useState<ProductIngredient[]>([])
  const [additions, setAdditions] = useState<OrderAddition[]>([])
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())
  const [additionIds, setAdditionIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [loadReady, setLoadReady] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [sauceRule, setSauceRule] = useState<SauceRule>(DEFAULT_SAUCE_RULE)
  const [ingredientCustomizationEnabled, setIngredientCustomizationEnabled] = useState(false)

  useEffect(() => {
    if (!open || !item) return
    let cancelled = false
    setRemovedIds(new Set(item.removed_ingredient_ids || []))
    setAdditionIds(new Set(item.additions_ids || []))
    setLoading(true)
    setLoadReady(false)
    setLoadError('')
    const load = async () => {
      try {
        const [additionResult, productResult] = await Promise.all([
          supabase.from('order_additions')
            .select('id, type, name, price, active, display_order, created_at, updated_at')
            .eq('active', true).order('display_order', { ascending: true }),
          supabase.from('products').select('category_id').eq('id', item.product.id).maybeSingle(),
        ])
        if (cancelled) return
        if (additionResult.error) throw additionResult.error
        if (productResult.error) throw productResult.error
        const categoryId = productResult.data?.category_id
        if (!categoryId) throw new Error('Categoria prodotto non disponibile')
        const categoryResult = await supabase.from('categories')
          .select('slug, ingredient_customization_enabled').eq('id', categoryId).maybeSingle()
        if (cancelled) return
        if (categoryResult.error) throw categoryResult.error
        const category = categoryResult.data
        if (!category) throw new Error('Categoria prodotto non disponibile')
        const customizationEnabled = category?.ingredient_customization_enabled === true
        const slug = String(category?.slug || '').trim().toLowerCase()
        const [ruleResult, ingredientResult] = await Promise.all([
          supabase.from('order_addition_category_rules')
            .select('sauce_mode, max_sauces, sauce_price')
            .eq('category_slug', slug).eq('active', true).limit(1).maybeSingle(),
          customizationEnabled
            ? supabase.from('product_ingredients')
                .select('id, product_id, name, removable, active, display_order, created_at, updated_at')
                .eq('product_id', item.product.id).eq('active', true).eq('removable', true)
                .order('display_order', { ascending: true })
            : Promise.resolve({ data: [] }),
        ])
        if (cancelled) return
        if (ruleResult.error) throw ruleResult.error
        if ('error' in ingredientResult && ingredientResult.error) throw ingredientResult.error
        setAdditions((additionResult.data || []) as OrderAddition[])
        setIngredients((ingredientResult.data || []) as ProductIngredient[])
        setRemovedIds(customizationEnabled ? new Set(item.removed_ingredient_ids || []) : new Set())
        setIngredientCustomizationEnabled(customizationEnabled)
        setSauceRule(ruleResult.data
          ? normalizeSauceRule(ruleResult.data as Partial<SauceRule>)
          : getFallbackSauceRuleByCategorySlug(slug))
        setLoadReady(true)
      } catch (error) {
        if (cancelled) return
        console.error('[cart-customizer] Loading error:', error)
        setLoadError('Impossibile caricare le opzioni di personalizzazione. Riprova più tardi.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [item, open])

  const selectedAdditions = useMemo(
    () => additions.filter((addition) => additionIds.has(addition.id)),
    [additionIds, additions]
  )
  const save = () => {
    if (!item || !loadReady) return
    const sauces = selectedAdditions.filter((addition) => addition.type === 'sauce')
    const extras = selectedAdditions.filter((addition) => addition.type === 'extra')
    const parts: string[] = []
    if (sauces.length) parts.push(`Salse: ${sauces.map((addition) => addition.name).join(', ')}`)
    if (extras.length) parts.push(`Extra: ${extras.map((addition) => addition.name).join(', ')}`)
    const saucePrice = sauceRule.sauce_mode === 'paid_multi'
      ? sauces.length * Number(sauceRule.sauce_price || 0)
      : 0
    replaceItem(getCartItemKey(item), {
      additions: parts.join(' | '),
      additionsIds: selectedAdditions.map((addition) => addition.id),
      additionsUnitPrice: saucePrice + extras.reduce((sum, addition) => sum + Number(addition.price || 0), 0),
      removedIngredientIds: ingredientCustomizationEnabled ? [...removedIds] : [],
      removedIngredients: (ingredientCustomizationEnabled ? ingredients : [])
        .filter((ingredient) => removedIds.has(ingredient.id))
        .map(({ id, name }) => ({ id, name })),
    })
    onOpenChange(false)
  }

  const content = (
    <>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-4">
        {loading ? <p className="text-sm text-muted-foreground">Caricamento...</p> : null}
        {loadError ? (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {loadError}
          </p>
        ) : null}
        {loadReady && ingredientCustomizationEnabled && ingredients.length > 0 ? (
          <>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Rimuovi ingredienti</h3>
              {ingredients.map((ingredient) => (
                <label key={ingredient.id} className="flex items-center gap-2 rounded-md border p-2.5">
                  <Checkbox checked={removedIds.has(ingredient.id)} onCheckedChange={(checked) => {
                    setRemovedIds((current) => {
                      const next = new Set(current)
                      if (checked) next.add(ingredient.id)
                      else next.delete(ingredient.id)
                      return next
                    })
                  }} />
                  <span>Senza {ingredient.name}</span>
                </label>
              ))}
            </div>
            <Separator />
          </>
        ) : null}
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Aggiunte</h3>
          {loadReady && additions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessuna aggiunta disponibile.</p>
          ) : loadReady ? additions.map((addition) => (
            <label key={addition.id} className="flex items-center justify-between gap-2 rounded-md border p-2.5">
              <span className="flex items-center gap-2">
                <Checkbox checked={additionIds.has(addition.id)} onCheckedChange={(checked) => {
                  setAdditionIds((current) => {
                    const next = new Set(current)
                    if (!checked) {
                      next.delete(addition.id)
                      return next
                    }
                    if (addition.type === 'sauce') {
                      if (sauceRule.sauce_mode === 'none') return next
                      if (sauceRule.sauce_mode === 'free_single') {
                        additions.filter((candidate) => candidate.type === 'sauce').forEach((candidate) => next.delete(candidate.id))
                      } else {
                        const selectedSauces = additions.filter((candidate) => candidate.type === 'sauce' && next.has(candidate.id))
                        if (selectedSauces.length >= sauceRule.max_sauces) {
                          toast.error(`Massimo ${sauceRule.max_sauces} salse`)
                          return current
                        }
                      }
                    }
                    next.add(addition.id)
                    return next
                  })
                }} />
                <span>{addition.name}</span>
              </span>
              {(addition.type === 'sauce' && sauceRule.sauce_mode === 'paid_multi') ? (
                <span>+{Number(sauceRule.sauce_price).toFixed(2)}€</span>
              ) : Number(addition.price) > 0 ? <span>+{Number(addition.price).toFixed(2)}€</span> : null}
            </label>
          )) : null}
        </div>
      </div>
      <div className="flex shrink-0 gap-2 border-t px-6 py-4">
        <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Annulla</Button>
        <Button className="flex-1" onClick={save} disabled={loading || !loadReady}>Aggiorna</Button>
      </div>
    </>
  )

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="flex max-h-[85vh] flex-col overflow-hidden p-0">
          <DrawerHeader className="px-6 pb-3 pt-6">
            <DrawerTitle>Personalizza {item?.product.name}</DrawerTitle>
            <DrawerDescription>La modifica si applica a tutta la riga.</DrawerDescription>
          </DrawerHeader>
          {content}
        </DrawerContent>
      </Drawer>
    )
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-xl flex-col overflow-hidden p-0">
        <DialogHeader className="px-6 pb-3 pt-6 text-left">
          <DialogTitle>Personalizza {item?.product.name}</DialogTitle>
          <DialogDescription>La modifica si applica a tutta la riga.</DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  )
}
