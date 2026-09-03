'use client'

/**
 * Vocabulary that flips between a housing society and a commercial plaza.
 * Layout is identical — only user-facing words change.
 */

import { useSociety } from './society-context'

export type Terms = {
  kind: 'society' | 'plaza'
  org: string          // "society" / "plaza"
  Org: string          // "Society" / "Plaza"
  resident: string     // "resident" / "tenant"
  Resident: string     // "Resident" / "Tenant"
  residents: string
  Residents: string
  fee: string          // "maintenance fee" / "rent"
  Fee: string          // "Maintenance" / "Rent"
  block: string        // "Block" / "Wing"
}

const SOCIETY: Terms = {
  kind: 'society', org: 'society', Org: 'Society',
  resident: 'resident', Resident: 'Resident', residents: 'residents', Residents: 'Residents',
  fee: 'maintenance fee', Fee: 'Maintenance', block: 'Block',
}

const PLAZA: Terms = {
  kind: 'plaza', org: 'plaza', Org: 'Plaza',
  resident: 'tenant', Resident: 'Tenant', residents: 'tenants', Residents: 'Tenants',
  fee: 'rent / CAM', Fee: 'Rent', block: 'Wing',
}

export function useTerms(): Terms {
  const { currentSociety } = useSociety()
  return currentSociety.kind === 'plaza' ? PLAZA : SOCIETY
}
