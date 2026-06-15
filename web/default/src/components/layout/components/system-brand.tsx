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
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { DEFAULT_LOGO } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { useStatus } from '@/hooks/use-status'
import { useSystemConfig } from '@/hooks/use-system-config'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

type SystemBrandProps = {
  defaultName?: string
  defaultVersion?: string
  /**
   * Visual layout:
   * - 'sidebar': stacked card style (used inside the sidebar header).
   * - 'inline': compact horizontal pill (used inside the top app bar).
   */
  variant?: 'sidebar' | 'inline'
}

/**
 * System brand component
 * Displays current system logo + name.
 * - inline: compact pill in the top app bar; clicking navigates to home (/)
 * - sidebar: stacked card in the sidebar header (display only)
 */
export function SystemBrand(props: SystemBrandProps) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const { logo } = useSystemConfig()

  const variant = props.variant ?? 'sidebar'
  const name = status?.system_name || props.defaultName || 'New API'
  const version =
    status?.version || props.defaultVersion || t('Unknown version')
  const isDefaultLogo = !logo || logo === DEFAULT_LOGO
  const sidebarLogo = isDefaultLogo ? '/scplus-logo.svg' : logo
  const collapsedLogo = isDefaultLogo ? DEFAULT_LOGO : logo

  if (variant === 'inline') {
    return (
      <Link
        to='/'
        aria-label={t('Go to home')}
        className={cn(
          'text-brand-mint inline-flex h-7 items-center gap-1.5 rounded-md px-1.5 text-sm font-medium transition-colors outline-none select-none',
          'focus-visible:ring-brand-highlight/50 hover:bg-white/10 hover:text-white focus-visible:ring-2'
        )}
      >
        <div className='flex size-5 items-center justify-center overflow-hidden rounded-md'>
          <img
            src={logo}
            alt={t('Logo')}
            className='size-full rounded-md object-cover'
          />
        </div>
        <span className='max-w-[12rem] truncate'>{name}</span>
      </Link>
    )
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size='lg'
          aria-label={`${name} ${version}`}
          className='h-12 cursor-default gap-3 rounded-[10px] px-0 text-white group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:justify-center hover:bg-transparent hover:text-white active:bg-transparent active:text-white'
          render={<div />}
        >
          <div className='flex min-w-0 flex-1 items-center group-data-[collapsible=icon]:hidden'>
            <img
              src={sidebarLogo}
              alt={t('Logo')}
              className='h-9 w-auto max-w-[160px] object-contain'
            />
          </div>
          <div className='hidden size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/8 ring-1 ring-white/10 group-data-[collapsible=icon]:flex'>
            <img
              src={collapsedLogo}
              alt={t('Logo')}
              className='size-full rounded-xl object-contain'
            />
          </div>
          <span className='sr-only'>
            {name} {version}
          </span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
