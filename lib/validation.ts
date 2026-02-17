// Input validation and sanitization utilities

export function sanitizeString(input: string, maxLength: number = 500): string {
  if (!input) return ''
  
  // Remove potentially dangerous characters
  let sanitized = input
    .replace(/[<>]/g, '') // Remove HTML tags
    .trim()
    .slice(0, maxLength)
  
  return sanitized
}

export function validatePhone(phone: string): boolean {
  // Italian phone number validation (basic)
  const phoneRegex = /^[\d\s\+\-\(\)]{8,20}$/
  return phoneRegex.test(phone)
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

export function validateOrderData(data: {
  customer_name: string
  customer_phone: string
  customer_address?: string
  notes?: string
}): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  
  // Name validation
  if (!data.customer_name || data.customer_name.length < 2) {
    errors.push('Nome non valido')
  }
  if (data.customer_name.length > 100) {
    errors.push('Nome troppo lungo')
  }
  
  // Phone validation
  if (!validatePhone(data.customer_phone)) {
    errors.push('Numero di telefono non valido')
  }
  
  // Address validation (if provided)
  if (data.customer_address && data.customer_address.length > 500) {
    errors.push('Indirizzo troppo lungo')
  }
  
  // Notes validation
  if (data.notes && data.notes.length > 1000) {
    errors.push('Note troppo lunghe')
  }
  
  return {
    valid: errors.length === 0,
    errors
  }
}

export function sanitizeOrderData(data: {
  customer_name: string
  customer_phone: string
  customer_address?: string | null
  notes?: string | null
}) {
  return {
    customer_name: sanitizeString(data.customer_name, 100),
    customer_phone: sanitizeString(data.customer_phone, 20),
    customer_address: data.customer_address ? sanitizeString(data.customer_address, 500) : null,
    notes: data.notes ? sanitizeString(data.notes, 1000) : null
  }
}
