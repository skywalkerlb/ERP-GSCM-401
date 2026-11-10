import type * as React from 'react';
export type IconName = 'home'|'box'|'cart'|'truck'|'users'|'chart'|'file'|'settings'|'search'|'plus'|'check'|'chevronDown'|'chevronRight'|'arrowUp'|'arrowDown'|'filter'|'download'|'info'|'alert'|'checkCircle'|'x'|'more';
export interface IconProps { name: IconName; size?: number; label?: string; className?: string }
export declare function Icon(props: IconProps): React.ReactElement;
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> { variant?: 'primary'|'secondary'|'ghost'|'danger'; size?: 'sm'|'md'|'lg'; icon?: IconName; iconRight?: IconName }
export declare function Button(props: ButtonProps): React.ReactElement;
export interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> { label?: string; hint?: string; error?: string; icon?: IconName; suffix?: React.ReactNode }
export declare function TextField(props: TextFieldProps): React.ReactElement;
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> { label?: string; hint?: string; error?: string; options: Array<string | { value: string; label: string }> }
export declare function Select(props: SelectProps): React.ReactElement;
export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> { label?: React.ReactNode }
export declare function Checkbox(props: CheckboxProps): React.ReactElement;
export interface BadgeProps { tone?: 'neutral'|'success'|'accent'|'warning'|'info'|'danger'; dot?: boolean; children?: React.ReactNode; className?: string }
export declare function Badge(props: BadgeProps): React.ReactElement;
export interface CardProps { title?: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; padded?: boolean; children?: React.ReactNode; className?: string }
export declare function Card(props: CardProps): React.ReactElement;
export interface StatCardProps { label: string; value: React.ReactNode; delta?: string; trend?: 'up'|'down'|'flat'; caption?: string; icon?: IconName; tint?: 'pink'|'cocoa'|'mint'|'butter'|'lilac' }
export declare function StatCard(props: StatCardProps): React.ReactElement;
export interface DataTableColumn<R = any> { key: string; header: React.ReactNode; align?: 'left'|'right'|'center'; width?: number|string; mono?: boolean; render?: (row: R) => React.ReactNode }
export interface DataTableProps<R = any> { columns: DataTableColumn<R>[]; rows: R[]; rowKey?: string; selectedKeys?: Array<string|number>; density?: 'default'|'compact'; empty?: React.ReactNode; onRowClick?: (row: R) => void }
export declare function DataTable(props: DataTableProps): React.ReactElement;
export interface TabsProps { items: Array<{ value: string; label: string; count?: number }>; value?: string; onChange?: (value: string) => void }
export declare function Tabs(props: TabsProps): React.ReactElement;
export interface SidebarNavProps { brand?: React.ReactNode; active?: string; onSelect?: (value: string) => void; sections: Array<{ title?: string; items: Array<{ value: string; label: string; icon?: IconName; href?: string; badge?: number|string }> }> }
export declare function SidebarNav(props: SidebarNavProps): React.ReactElement;
export interface AlertProps { tone?: 'info'|'success'|'warning'|'danger'; title?: React.ReactNode; children?: React.ReactNode; action?: React.ReactNode }
export declare function Alert(props: AlertProps): React.ReactElement;
declare global { interface Window { Glazed: { Icon: typeof Icon; Button: typeof Button; TextField: typeof TextField; Select: typeof Select; Checkbox: typeof Checkbox; Badge: typeof Badge; Card: typeof Card; StatCard: typeof StatCard; DataTable: typeof DataTable; Tabs: typeof Tabs; SidebarNav: typeof SidebarNav; Alert: typeof Alert } } }
