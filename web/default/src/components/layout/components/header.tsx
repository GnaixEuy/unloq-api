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
import { cn } from '@/lib/utils'
import { SidebarTrigger } from '@/components/ui/sidebar'

type HeaderProps = React.HTMLAttributes<HTMLElement>

export function Header({ className, children, ...props }: HeaderProps) {
  return (
    <header
      className={cn(
        'text-brand-mint sticky top-0 z-40 h-[var(--app-header-height,3.5rem)] w-full shrink-0 border-b border-white/[0.06] bg-[#023545]',
        className
      )}
      {...props}
    >
      <div className='[&_[data-slot=button]]:text-brand-mint/75 flex h-full items-center gap-2 px-4 sm:px-6 [&_[data-slot=button]:hover]:bg-white/5 [&_[data-slot=button]:hover]:text-white'>
        <SidebarTrigger
          variant='ghost'
          className='text-brand-mint size-8 hover:bg-white/10 hover:text-white'
        />
        {children}
      </div>
    </header>
  )
}
