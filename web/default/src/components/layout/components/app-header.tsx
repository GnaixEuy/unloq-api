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
import { useLocation } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useNotifications } from '@/hooks/use-notifications'
import { useSidebarData } from '@/hooks/use-sidebar-data'
import { useTopNavLinks } from '@/hooks/use-top-nav-links'
import { ConfigDrawer } from '@/components/config-drawer'
import { LanguageSwitcher } from '@/components/language-switcher'
import { NotificationPopover } from '@/components/notification-popover'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { defaultTopNavLinks } from '../config/top-nav.config'
import { type NavGroup, type NavItem, type TopNavLink } from '../types'
import { Header } from './header'
import { TopNav } from './top-nav'

/**
 * General application Header component
 * Integrates navigation bar, search, configuration and profile functions
 *
 * @example
 * // Basic usage
 * <AppHeader />
 *
 * @example
 * // Custom navigation links
 * <AppHeader navLinks={customLinks} />
 *
 * @example
 * // Hide navigation bar and search box
 * <AppHeader showTopNav={false} showSearch={false} />
 *
 * @example
 * // Fully customize left and right content
 * <AppHeader
 *   leftContent={<CustomLeft />}
 *   rightContent={<CustomRight />}
 * />
 */
type AppHeaderProps = {
  /**
   * Custom navigation links, uses default global navigation or dynamically generated from backend if not provided
   */
  navLinks?: TopNavLink[]
  /**
   * Whether to show top navigation bar
   * @default false
   */
  showTopNav?: boolean
  /**
   * Left content, overrides TopNav if provided
   */
  leftContent?: React.ReactNode
  /**
   * Whether to show search box
   * @default false
   */
  showSearch?: boolean
  /**
   * Custom right content, overrides default right content if provided
   */
  rightContent?: React.ReactNode
  /**
   * Whether to show notification button
   * @default true
   */
  showNotifications?: boolean
  /**
   * Whether to show config drawer
   * @default true
   */
  showConfigDrawer?: boolean
  /**
   * Whether to show profile dropdown
   * @default true
   */
  showProfileDropdown?: boolean
}

export function AppHeader({
  navLinks = defaultTopNavLinks,
  showTopNav = false,
  leftContent,
  showSearch = false,
  rightContent,
  showNotifications = true,
  showConfigDrawer = true,
  showProfileDropdown = true,
}: AppHeaderProps) {
  const { t } = useTranslation()
  const pathname = useLocation({ select: (location) => location.pathname })
  const sidebarData = useSidebarData()
  const title = useMemo(
    () => resolveHeaderTitle(pathname, sidebarData.navGroups, t('Dashboard')),
    [pathname, sidebarData.navGroups, t]
  )

  // Prioritize dynamically generated links from backend
  const dynamicLinks = useTopNavLinks()
  const links = dynamicLinks.length > 0 ? dynamicLinks : navLinks

  // Notifications hook
  const notifications = useNotifications()

  return (
    <>
      <Header>
        {leftContent ? (
          <div className='ms-2 flex items-center'>{leftContent}</div>
        ) : (
          <div className='ms-1 flex min-w-0 items-center text-sm leading-[1.43]'>
            <span className='truncate text-white'>{title}</span>
          </div>
        )}

        {rightContent ?? (
          <div className='ms-auto flex items-center gap-2'>
            {showTopNav && (
              <div className='me-1 hidden lg:block'>
                <TopNav links={links} />
              </div>
            )}
            {showSearch && <Search />}
            {showNotifications && (
              <NotificationPopover
                className='size-8'
                open={notifications.popoverOpen}
                onOpenChange={notifications.setPopoverOpen}
                unreadCount={notifications.unreadCount}
                activeTab={notifications.activeTab}
                onTabChange={notifications.setActiveTab}
                notice={notifications.notice}
                announcements={notifications.announcements}
                loading={notifications.loading}
              />
            )}
            <LanguageSwitcher tone='app' />
            {showConfigDrawer && <ConfigDrawer />}
            {showProfileDropdown && <ProfileDropdown size='default' />}
          </div>
        )}
      </Header>
    </>
  )
}

function resolveHeaderTitle(
  pathname: string,
  navGroups: NavGroup[],
  fallback: string
) {
  const title = findNavTitle(pathname, navGroups)
  if (title) return title

  const segment = pathname.split('/').filter(Boolean).at(0)
  if (!segment) return fallback

  return segment
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function findNavTitle(pathname: string, navGroups: NavGroup[]) {
  for (const group of navGroups) {
    for (const item of group.items) {
      const title = findItemTitle(pathname, item)
      if (title) return title
    }
  }
  return null
}

function findItemTitle(pathname: string, item: NavItem): string | null {
  if (item.type === 'chat-presets') {
    return pathname.startsWith('/chat') ? item.title : null
  }

  if ('items' in item && item.items) {
    for (const child of item.items) {
      const childPath = String(child.url).split('?')[0]
      if (pathname === childPath || pathname.startsWith(`${childPath}/`)) {
        return child.title
      }
    }
    return null
  }

  if ('url' in item && item.url) {
    const itemPath = String(item.url).split('?')[0]
    if (pathname === itemPath || pathname.startsWith(`${itemPath}/`)) {
      return item.title
    }
  }

  if (item.activeUrls?.some((url) => pathname.startsWith(String(url)))) {
    return item.title
  }

  return null
}
