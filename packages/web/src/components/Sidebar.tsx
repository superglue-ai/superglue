"use client"

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Layout, History, Book, PlayCircle } from "lucide-react";

const navItems = [
  { icon: Layout, label: 'Configurations', href: '/' },
  { icon: History, label: 'Runs', href: '/runs' },
  { icon: PlayCircle, label: 'Playground', href: '/playground' },
  { icon: Book, label: 'Documentation', href: 'https://docs.superglue.cloud', target: '_blank' },
/*  { icon: AlertCircle, label: 'Error Monitoring', href: '/analytics' },
  { icon: Shield, label: 'Access Control', href: '/access-control' },
  { icon: Code, label: 'SDK Generation', href: '/sdk' },
  { icon: Layout, label: 'Documentation', href: '/docs' }, */
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="w-64 min-w-64 flex-shrink-0 bg-background border-r border-border flex flex-col">
      <div className="p-6">
        <div className="relative mx-auto">
          <img src="/logo.svg" alt="superglue Logo" className="max-w-full h-[50px] w-[200px] ml-auto mr-auto" />
          <div className="text-center text-sm text-muted-foreground mt-2">
            Data Transformer
          </div>
        </div>
      </div>
      <nav className="flex-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              target={item.target || '_self'}
              className={`flex items-center px-6 py-3 text-sm transition-colors ${
                isActive 
                  ? 'bg-secondary text-primary font-medium' 
                  : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4 mr-3" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
} 