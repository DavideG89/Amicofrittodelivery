'use client'

import type { ReactNode, RefObject } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { useIsMobile } from '@/hooks/use-mobile'

type ResponsiveEditorModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  trigger: ReactNode
  children: ReactNode
  footer: ReactNode
  returnFocusRef?: RefObject<HTMLElement | null>
}

export function ResponsiveEditorModal({
  open,
  onOpenChange,
  title,
  description,
  trigger,
  children,
  footer,
  returnFocusRef,
}: ResponsiveEditorModalProps) {
  const isMobile = useIsMobile()
  const restoreFocus = (event: Event) => {
    if (!returnFocusRef?.current) return
    event.preventDefault()
    returnFocusRef.current.focus()
  }

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent
          className="max-h-[92dvh] overflow-hidden rounded-t-2xl"
          onCloseAutoFocus={restoreFocus}
        >
          <DrawerHeader className="px-6 pb-3 pt-4 text-left">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5">{children}</div>
          <DrawerFooter className="border-t bg-background px-6 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4">
            {footer}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className="max-h-[90vh] max-w-2xl overflow-y-auto"
        onCloseAutoFocus={restoreFocus}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
