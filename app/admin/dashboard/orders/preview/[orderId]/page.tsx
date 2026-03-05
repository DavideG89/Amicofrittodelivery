import { redirect } from 'next/navigation'

export default function DeprecatedOrderPrintPreviewPage() {
  redirect('/admin/dashboard/orders')
}
