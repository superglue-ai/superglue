"use client"

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Layout, History, Database, Settings, Code, AlertCircle, Shield, X, Menu} from "lucide-react";
import { motion } from "framer-motion";

const navItems = [
  { icon: Layout, label: 'Configurations', href: '/' },
  { icon: History, label: 'Runs', href: '/runs' },
/*  { icon: AlertCircle, label: 'Error Monitoring', href: '/analytics' },
  { icon: Shield, label: 'Access Control', href: '/access-control' },
  { icon: Code, label: 'SDK Generation', href: '/sdk' },
  { icon: Layout, label: 'Documentation', href: '/docs' }, */
];

export function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(true);
  const toggleSidebar = () => setIsOpen(!isOpen);

  return (
    <motion.div
      animate={{ width: isOpen ? 256 : 80 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className="flex flex-col border-r dark:border-gray-800 bg-white dark:bg-gray-900 h-screen"
    >
      {/* Logo & Close Button */}
      <div className="flex items-center justify-between px-4 py-6">
        {isOpen ? (
          <>
            <div className="flex items-center gap-3">
              <img
                src="/logo.svg"
                alt="superglue Logo"
                className="h-10 w-48 object-contain"
              />
            </div>
            <button
              onClick={toggleSidebar}
              className="text-gray-600 dark:text-gray-400 p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
            >
              <X className=" h-6 w-6" />
            </button>
          </>
        ) : (
          <button
            onClick={toggleSidebar}
            className="text-gray-600 dark:text-gray-400 p-2 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
          >
            <Menu className="h-6 w-6" />
          </button>
        )}
      </div>


      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="text-center text-sm text-gray-400 dark:text-gray-300 -mt-3 mb-4"
        >
          Data Proxy
        </motion.div>
      )}

      <nav className="flex-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <motion.div
              key={item.href}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <Link
                href={item.href}
                className={`flex items-center px-6 py-3 text-sm transition-all duration-200 ease-in-out ${
                  isActive
                    ? "bg-gray-100 dark:bg-secondary text-gray-900 dark:text-white border-r-2 border-gray-900 dark:border-white"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-secondary"
                }`}
              >
                <Icon className="h-5 w-5 mr-3" />
                {isOpen && <span>{item.label}</span>}
              </Link>
            </motion.div>
          );
        })}
      </nav>
    </motion.div>
  );
}
