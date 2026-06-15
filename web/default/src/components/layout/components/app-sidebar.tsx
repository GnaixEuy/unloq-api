/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { LogOut } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/stores/auth-store'
import { getUserAvatarFallback } from '@/lib/avatar'
import { MOTION_TRANSITION, MOTION_VARIANTS } from '@/lib/motion'
import { useLayout } from '@/context/layout-provider'
import useDialogState from '@/hooks/use-dialog'
import { useSidebarView } from '@/hooks/use-sidebar-view'
import { useUserDisplay } from '@/hooks/use-user-display'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar'
import { SignOutDialog } from '@/components/sign-out-dialog'
import { NavGroup } from './nav-group'
import { SidebarViewHeader } from './sidebar-view-header'
import { SystemBrand } from './system-brand'

/**
 * Application sidebar.
 *
 * Adopts the Vercel / Cloudflare "drill-in" pattern: the URL drives
 * which sidebar *view* is rendered. Clicking a top-level entry like
 * `System Settings` swaps the sidebar to a contextual workspace —
 * with a `← Back to Dashboard` affordance — instead of stacking the
 * sub-navigation inside the root tree.
 *
 * Architecture:
 *   - View resolution + filtering: {@link useSidebarView}
 *   - View registry: `layout/lib/sidebar-view-registry.ts`
 *   - Per-view header: {@link SidebarViewHeader}
 *
 * Adding a new nested view only requires registering a {@link SidebarView}
 * in the registry; this component requires no changes.
 */
export function AppSidebar() {
  const { collapsible, variant } = useLayout()
  const { key, view, navGroups } = useSidebarView()
  const shouldReduce = useReducedMotion()

  return (
    <Sidebar collapsible={collapsible} variant={variant}>
      <SidebarHeader className='border-sidebar-border h-[77px] justify-center border-b py-0 pr-3 pl-5'>
        <SystemBrand variant='sidebar' />
      </SidebarHeader>

      {view && <SidebarViewHeader view={view} />}

      <SidebarContent className='px-0 pt-4 pb-3'>
        <AnimatePresence mode='wait' initial={false}>
          <motion.div
            key={key}
            initial={
              shouldReduce ? false : MOTION_VARIANTS.sidebarSlide.initial
            }
            animate={MOTION_VARIANTS.sidebarSlide.animate}
            exit={shouldReduce ? undefined : MOTION_VARIANTS.sidebarSlide.exit}
            transition={MOTION_TRANSITION.fast}
            className='flex flex-col'
          >
            {navGroups.map((props) => (
              <NavGroup key={props.id || props.title} {...props} />
            ))}
          </motion.div>
        </AnimatePresence>
      </SidebarContent>

      <SidebarUserBlock />

      <SidebarRail />
    </Sidebar>
  )
}

function SidebarUserBlock() {
  const { t } = useTranslation()
  const [open, setOpen] = useDialogState()
  const user = useAuthStore((state) => state.auth.user)
  const { displayName, roleLabel } = useUserDisplay(user)
  const avatarName = user?.username || displayName
  const avatarFallback = useMemo(
    () => getUserAvatarFallback(avatarName),
    [avatarName]
  )

  return (
    <>
      <SidebarFooter className='border-sidebar-border border-t px-4 py-[17px] group-data-[collapsible=icon]:px-2'>
        <div className='flex items-center gap-3 group-data-[collapsible=icon]:justify-center'>
          <Link
            to='/profile'
            className='focus-visible:ring-brand-highlight/40 flex min-w-0 flex-1 items-center gap-3 rounded-[10px] outline-none group-data-[collapsible=icon]:flex-none focus-visible:ring-2'
          >
            <Avatar className='size-8'>
              <AvatarFallback className='bg-brand-highlight text-sm font-semibold text-white'>
                {avatarFallback}
              </AvatarFallback>
            </Avatar>
            <div className='min-w-0 flex-1 overflow-hidden group-data-[collapsible=icon]:hidden'>
              <div className='truncate text-sm leading-5 text-white'>
                {displayName || user?.username || t('User')}
              </div>
              <div className='truncate text-xs leading-4 text-white/45'>
                {roleLabel || user?.group || '-'}
              </div>
            </div>
          </Link>
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            className='size-7 shrink-0 text-white/45 group-data-[collapsible=icon]:hidden hover:bg-white/10 hover:text-white'
            aria-label={t('Sign out')}
            onClick={() => setOpen(true)}
          >
            <LogOut />
          </Button>
        </div>
      </SidebarFooter>
      <SignOutDialog open={!!open} onOpenChange={setOpen} />
    </>
  )
}
