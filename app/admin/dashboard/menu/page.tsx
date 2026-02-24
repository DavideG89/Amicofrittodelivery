'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Plus, Edit, Trash2, Eye, EyeOff, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { supabase, Category, Product, OrderAddition, OrderAdditionType } from '@/lib/supabase'
import { toast } from 'sonner'

export default function MenuManagementPage() {
  const router = useRouter()
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [additions, setAdditions] = useState<OrderAddition[]>([])
  const adminPages = [
    { href: '/admin/dashboard', label: 'Dashboard' },
    { href: '/admin/dashboard/orders', label: 'Ordini' },
    { href: '/admin/dashboard/menu', label: 'Menu' },
    { href: '/admin/dashboard/upsell', label: 'Upsell' },
    { href: '/admin/dashboard/discounts', label: 'Sconti' },
    { href: '/admin/dashboard/settings', label: 'Impostazioni' },
  ]
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const [additionDialogOpen, setAdditionDialogOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [editingAddition, setEditingAddition] = useState<OrderAddition | null>(null)

  const [productForm, setProductForm] = useState({
    category_id: '',
    name: '',
    description: '',
    price: '',
    image_url: '',
    ingredients: '',
    allergens: '',
    available: true,
    label: '' as '' | 'sconto' | 'novita'
  })

  const [categoryForm, setCategoryForm] = useState({
    name: '',
    slug: ''
  })

  const [additionForm, setAdditionForm] = useState({
    type: 'sauce' as OrderAdditionType,
    name: '',
    price: '0.00',
    active: true,
  })

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    try {
      const { data: categoriesData } = await supabase
        .from('categories')
        .select('id, name, slug, display_order, created_at, updated_at')
        .order('display_order', { ascending: true })

      const { data: productsData } = await supabase
        .from('products')
        .select('id, category_id, name, description, price, image_url, ingredients, allergens, available, label, display_order, created_at, updated_at')
        .order('display_order', { ascending: true })

      const { data: additionsData, error: additionsError } = await supabase
        .from('order_additions')
        .select('id, type, name, price, active, display_order, created_at, updated_at')
        .order('display_order', { ascending: true })

      if (additionsError && additionsError.code !== '42P01') {
        throw additionsError
      }

      setCategories(categoriesData || [])
      setProducts(productsData || [])
      setAdditions((additionsData || []) as OrderAddition[])
    } catch (error) {
      console.error('[v0] Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  const resetProductForm = () => {
    setProductForm({
      category_id: categories[0]?.id || '',
      name: '',
      description: '',
      price: '',
      image_url: '',
      ingredients: '',
      allergens: '',
      available: true,
      label: ''
    })
    setEditingProduct(null)
  }

  const resetCategoryForm = () => {
    setCategoryForm({
      name: '',
      slug: ''
    })
    setEditingCategory(null)
  }

  const resetAdditionForm = () => {
    setAdditionForm({
      type: 'sauce',
      name: '',
      price: '0.00',
      active: true,
    })
    setEditingAddition(null)
  }

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product)
    setProductForm({
      category_id: product.category_id,
      name: product.name,
      description: product.description || '',
      price: product.price.toString(),
      image_url: product.image_url || '',
      ingredients: product.ingredients || '',
      allergens: product.allergens || '',
      available: product.available,
      label: product.label || ''
    })
    setDialogOpen(true)
  }

  const handleSaveProduct = async () => {
    if (!productForm.name || !productForm.price || !productForm.category_id) {
      toast.error('Compila tutti i campi obbligatori')
      return
    }

    try {
      const productData = {
        category_id: productForm.category_id,
        name: productForm.name,
        description: productForm.description || null,
        price: parseFloat(productForm.price),
        image_url: productForm.image_url || null,
        ingredients: productForm.ingredients || null,
        allergens: productForm.allergens || null,
        available: productForm.available,
        label: productForm.label || null
      }


      if (editingProduct) {
        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', editingProduct.id)

        if (error) {
          console.error('[v0] Update error:', error)
          throw error
        }
        toast.success('Prodotto aggiornato')
      } else {
        const { error } = await supabase
          .from('products')
          .insert(productData)

        if (error) {
          console.error('[v0] Insert error:', error)
          throw error
        }
        toast.success('Prodotto creato')
      }

      setDialogOpen(false)
      resetProductForm()
      await fetchData()
    } catch (error) {
      console.error('[v0] Error saving product:', error)
      toast.error('Errore durante il salvataggio')
    }
  }

  const handleDeleteProduct = async (id: string) => {
    if (!confirm('Sei sicuro di voler eliminare questo prodotto?')) return

    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id)

      if (error) throw error
      toast.success('Prodotto eliminato')
      fetchData()
    } catch (error) {
      console.error('[v0] Error deleting product:', error)
      toast.error('Errore durante l\'eliminazione')
    }
  }

  const handleToggleAvailability = async (product: Product) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({ available: !product.available })
        .eq('id', product.id)

      if (error) throw error
      toast.success(product.available ? 'Prodotto nascosto' : 'Prodotto visibile')
      fetchData()
    } catch (error) {
      console.error('[v0] Error toggling availability:', error)
      toast.error('Errore durante l\'aggiornamento')
    }
  }

  const handleSaveCategory = async () => {
    if (!categoryForm.name) {
      toast.error('Inserisci il nome della categoria')
      return
    }

    try {
      const slug = categoryForm.slug || categoryForm.name.toLowerCase().replace(/\s+/g, '-')
      
      
      if (editingCategory) {
        const { error } = await supabase
          .from('categories')
          .update({ name: categoryForm.name, slug })
          .eq('id', editingCategory.id)

        if (error) {
          console.error('[v0] Category update error:', error)
          throw error
        }
        toast.success('Categoria aggiornata')
      } else {
        const { error } = await supabase
          .from('categories')
          .insert({ name: categoryForm.name, slug })

        if (error) {
          console.error('[v0] Category insert error:', error)
          throw error
        }
        toast.success('Categoria creata')
      }

      setCategoryDialogOpen(false)
      resetCategoryForm()
      await fetchData()
    } catch (error) {
      console.error('[v0] Error saving category:', error)
      toast.error('Errore durante il salvataggio')
    }
  }

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Sei sicuro? Questo eliminerà anche tutti i prodotti della categoria.')) return

    try {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', id)

      if (error) throw error
      toast.success('Categoria eliminata')
      fetchData()
    } catch (error) {
      console.error('[v0] Error deleting category:', error)
      toast.error('Errore durante l\'eliminazione')
    }
  }

  const handleEditAddition = (addition: OrderAddition) => {
    setEditingAddition(addition)
    setAdditionForm({
      type: addition.type,
      name: addition.name,
      price: Number(addition.price || 0).toFixed(2),
      active: Boolean(addition.active),
    })
    setAdditionDialogOpen(true)
  }

  const handleSaveAddition = async () => {
    if (!additionForm.name.trim()) {
      toast.error('Inserisci il nome dell\'aggiunta')
      return
    }

    const parsedPrice = Number(additionForm.price)
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      toast.error('Prezzo non valido')
      return
    }

    try {
      const payload = {
        type: additionForm.type,
        name: additionForm.name.trim(),
        price: Math.round(parsedPrice * 100) / 100,
        active: additionForm.active,
      }

      if (editingAddition) {
        const { error } = await supabase
          .from('order_additions')
          .update(payload)
          .eq('id', editingAddition.id)
        if (error) throw error
        toast.success('Aggiunta aggiornata')
      } else {
        const typeItems = additions.filter((item) => item.type === additionForm.type)
        const nextDisplayOrder =
          typeItems.length > 0 ? Math.max(...typeItems.map((item) => Number(item.display_order || 0))) + 1 : 0
        const { error } = await supabase
          .from('order_additions')
          .insert({ ...payload, display_order: nextDisplayOrder })
        if (error) throw error
        toast.success('Aggiunta creata')
      }

      setAdditionDialogOpen(false)
      resetAdditionForm()
      await fetchData()
    } catch (error) {
      console.error('[v0] Error saving addition:', error)
      toast.error('Errore durante il salvataggio aggiunta')
    }
  }

  const handleToggleAddition = async (addition: OrderAddition) => {
    try {
      const { error } = await supabase
        .from('order_additions')
        .update({ active: !addition.active })
        .eq('id', addition.id)
      if (error) throw error
      toast.success(addition.active ? 'Aggiunta disattivata' : 'Aggiunta attivata')
      await fetchData()
    } catch (error) {
      console.error('[v0] Error toggling addition:', error)
      toast.error('Errore durante l\'aggiornamento aggiunta')
    }
  }

  const handleDeleteAddition = async (id: string) => {
    if (!confirm('Sei sicuro di voler eliminare questa aggiunta?')) return
    try {
      const { error } = await supabase
        .from('order_additions')
        .delete()
        .eq('id', id)
      if (error) throw error
      toast.success('Aggiunta eliminata')
      await fetchData()
    } catch (error) {
      console.error('[v0] Error deleting addition:', error)
      toast.error('Errore durante l\'eliminazione aggiunta')
    }
  }

  const compareProductName = (a: Product, b: Product) =>
    a.name.localeCompare(b.name, 'it', { sensitivity: 'base', numeric: true })

  const getProductsByCategory = (categoryId: string) => {
    return products
      .filter(p => p.category_id === categoryId)
      .sort(compareProductName)
  }

  const sauceAdditions = additions.filter((addition) => addition.type === 'sauce')
  const extraAdditions = additions.filter((addition) => addition.type === 'extra')

  if (loading) {
    return <div className="p-6">Caricamento...</div>
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger className="text-left">
                <h1 className="inline-flex items-center gap-2 text-3xl font-bold">
                  Gestione Menu
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
          <h1 className="hidden md:block text-3xl font-bold">Gestione Menu</h1>
          <p className="text-muted-foreground">Gestisci categorie e prodotti</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" onClick={resetCategoryForm} className="w-full sm:w-auto">
                <Plus className="mr-2 h-4 w-4" />
                Nuova Categoria
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingCategory ? 'Modifica Categoria' : 'Nuova Categoria'}
                </DialogTitle>
                <DialogDescription>
                  Crea o modifica una categoria del menu
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="category-name">Nome *</Label>
                  <Input
                    id="category-name"
                    value={categoryForm.name}
                    onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                    placeholder="Es: Panini"
                  />
                </div>
                <div>
                  <Label htmlFor="category-slug">Slug (opzionale)</Label>
                  <Input
                    id="category-slug"
                    value={categoryForm.slug}
                    onChange={(e) => setCategoryForm({ ...categoryForm, slug: e.target.value })}
                    placeholder="Es: panini"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCategoryDialogOpen(false)}>
                  Annulla
                </Button>
                <Button onClick={handleSaveCategory}>Salva</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={additionDialogOpen} onOpenChange={setAdditionDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" onClick={resetAdditionForm} className="w-full sm:w-auto">
                <Plus className="mr-2 h-4 w-4" />
                Nuova Aggiunta
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingAddition ? 'Modifica Aggiunta' : 'Nuova Aggiunta'}
                </DialogTitle>
                <DialogDescription>
                  Gestisci salse ed extra mostrati nel modale aggiunte.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="addition-type">Tipo *</Label>
                  <Select
                    value={additionForm.type}
                    onValueChange={(value) => setAdditionForm((prev) => ({ ...prev, type: value as OrderAdditionType }))}
                  >
                    <SelectTrigger id="addition-type">
                      <SelectValue placeholder="Tipo aggiunta" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sauce">Salsa</SelectItem>
                      <SelectItem value="extra">Extra</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="addition-name">Nome *</Label>
                  <Input
                    id="addition-name"
                    value={additionForm.name}
                    onChange={(e) => setAdditionForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder={additionForm.type === 'sauce' ? 'Es: Maionese' : 'Es: Cheddar'}
                  />
                </div>
                <div>
                  <Label htmlFor="addition-price">Prezzo (€)</Label>
                  <Input
                    id="addition-price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={additionForm.price}
                    onChange={(e) => setAdditionForm((prev) => ({ ...prev, price: e.target.value }))}
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border p-3">
                  <Label htmlFor="addition-active">Attiva</Label>
                  <Switch
                    id="addition-active"
                    checked={additionForm.active}
                    onCheckedChange={(checked) => setAdditionForm((prev) => ({ ...prev, active: checked }))}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAdditionDialogOpen(false)}>
                  Annulla
                </Button>
                <Button onClick={handleSaveAddition}>Salva</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetProductForm} className="w-full sm:w-auto">
                <Plus className="mr-2 h-4 w-4" />
                Nuovo Prodotto
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingProduct ? 'Modifica Prodotto' : 'Nuovo Prodotto'}
                </DialogTitle>
                <DialogDescription>
                  Aggiungi o modifica un prodotto del menu
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="category">Categoria *</Label>
                  <Select
                    value={productForm.category_id}
                    onValueChange={(value) => setProductForm({ ...productForm, category_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="name">Nome *</Label>
                  <Input
                    id="name"
                    value={productForm.name}
                    onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                    placeholder="Es: Hamburger Classico"
                  />
                </div>

                <div>
                  <Label htmlFor="description">Descrizione</Label>
                  <Textarea
                    id="description"
                    value={productForm.description}
                    onChange={(e) => setProductForm({ ...productForm, description: e.target.value })}
                    placeholder="Descrizione del prodotto"
                  />
                </div>

                <div>
                  <Label htmlFor="price">Prezzo (€) *</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    value={productForm.price}
                    onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                    placeholder="9.99"
                  />
                </div>

                <div>
                  <Label htmlFor="image_url">Immagine Prodotto</Label>
                  <Input
                    id="image_url"
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        // Create a local URL for the image
                        const reader = new FileReader()
                        reader.onloadend = () => {
                          setProductForm({ ...productForm, image_url: reader.result as string })
                        }
                        reader.readAsDataURL(file)
                      }
                    }}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Oppure inserisci un percorso locale come: /burgers/amico-burger.png
                  </p>
                  <Input
                    placeholder="/percorso/immagine.jpg"
                    value={productForm.image_url}
                    onChange={(e) => setProductForm({ ...productForm, image_url: e.target.value })}
                    className="mt-2"
                  />
                  {productForm.image_url && (
                    <div className="mt-2 relative w-32 h-32 border rounded overflow-hidden">
                      <Image
                        src={productForm.image_url}
                        alt="Preview"
                        fill
                        className="object-cover"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <Label htmlFor="ingredients">Ingredienti</Label>
                  <Textarea
                    id="ingredients"
                    value={productForm.ingredients}
                    onChange={(e) => setProductForm({ ...productForm, ingredients: e.target.value })}
                    placeholder="Pane, carne, lattuga..."
                  />
                </div>

                <div>
                  <Label htmlFor="allergens">Allergeni (separati da virgola)</Label>
                  <Input
                    id="allergens"
                    value={productForm.allergens}
                    onChange={(e) => setProductForm({ ...productForm, allergens: e.target.value })}
                    placeholder="Glutine, Lattosio"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="available">Disponibile</Label>
                  <Switch
                    id="available"
                    checked={productForm.available}
                    onCheckedChange={(checked) => setProductForm({ ...productForm, available: checked })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="label">Etichetta Promozionale</Label>
                  <Select
                    value={productForm.label || 'none'}
                    onValueChange={(value) => setProductForm({ ...productForm, label: value === 'none' ? '' : value as 'sconto' | 'novita' })}
                  >
                    <SelectTrigger id="label">
                      <SelectValue placeholder="Nessuna etichetta" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nessuna</SelectItem>
                      <SelectItem value="sconto">Sconto</SelectItem>
                      <SelectItem value="novita">Novità</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Mostra un badge sulla card del prodotto
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Annulla
                </Button>
                <Button onClick={handleSaveProduct}>Salva</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue={categories[0]?.id} className="w-full">
        <div className="mb-4 w-full overflow-x-auto rounded-md bg-muted p-1">
          <TabsList className="w-max justify-start bg-transparent p-0">
            {categories.map((category) => (
              <TabsTrigger key={category.id} value={category.id} className="shrink-0">
                {category.name} ({getProductsByCategory(category.id).length})
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {categories.map((category) => {
          const categoryProducts = getProductsByCategory(category.id)
          
          return (
            <TabsContent key={category.id} value={category.id}>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>{category.name}</CardTitle>
                      <CardDescription>
                        {categoryProducts.length} prodotti
                      </CardDescription>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteCategory(category.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Elimina Categoria
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {categoryProducts.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                      Nessun prodotto in questa categoria
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {categoryProducts.map((product) => (
                        <Card key={product.id}>
                          <CardContent className="p-3 sm:p-4">
                            <div className="flex gap-3 sm:gap-4 items-stretch min-h-[96px] sm:min-h-[104px]">
                              <div className="relative w-28 sm:w-36 self-stretch min-h-[96px] sm:min-h-[104px] bg-muted rounded-md overflow-hidden flex-shrink-0">
                                {product.image_url ? (
                                  <Image
                                    src={product.image_url}
                                    alt={product.name}
                                    fill
                                    className="object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                                    No img
                                  </div>
                                )}
                              </div>

                              <div className="flex-grow">
                                <div>
                                  <div className="flex items-start justify-between">
                                    <div>
                                    <h3 className="font-semibold text-sm sm:text-base">{product.name}</h3>
                                    {product.description && (
                                      <p className="text-xs sm:text-sm text-muted-foreground line-clamp-1">
                                        {product.description}
                                      </p>
                                    )}
                                    <p className="font-bold mt-1 text-sm sm:text-base">{product.price.toFixed(2)}€</p>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2 mt-2">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleToggleAvailability(product)}
                                      title={product.available ? 'Nascondi' : 'Mostra'}
                                    >
                                      {product.available ? (
                                        <Eye className="h-4 w-4" />
                                      ) : (
                                        <EyeOff className="h-4 w-4" />
                                      )}
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleEditProduct(product)}
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleDeleteProduct(product.id)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>

                                {!product.available && (
                                  <span className="inline-block mt-2 text-xs bg-destructive/10 text-destructive px-2 py-1 rounded">
                                    Non disponibile
                                  </span>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )
        })}
      </Tabs>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Aggiunte</CardTitle>
          <CardDescription>
            Configura le opzioni mostrate nel modale cliente: “Scegli una salsa” ed “Extra”.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3">
            <h3 className="font-semibold">Salse ({sauceAdditions.length})</h3>
            {sauceAdditions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessuna salsa configurata.</p>
            ) : (
              <div className="space-y-2">
                {sauceAdditions.map((addition) => (
                  <div key={addition.id} className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <p className="font-medium text-sm">{addition.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {Number(addition.price || 0).toFixed(2)}€ {addition.active ? '• Attiva' : '• Disattiva'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleToggleAddition(addition)}>
                        {addition.active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleEditAddition(addition)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteAddition(addition.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="font-semibold">Extra ({extraAdditions.length})</h3>
            {extraAdditions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessun extra configurato.</p>
            ) : (
              <div className="space-y-2">
                {extraAdditions.map((addition) => (
                  <div key={addition.id} className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <p className="font-medium text-sm">{addition.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {Number(addition.price || 0).toFixed(2)}€ {addition.active ? '• Attiva' : '• Disattiva'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleToggleAddition(addition)}>
                        {addition.active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleEditAddition(addition)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteAddition(addition.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
