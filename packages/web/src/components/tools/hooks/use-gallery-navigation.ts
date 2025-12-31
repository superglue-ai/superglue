import { useState, useRef, useEffect, useCallback, RefObject } from 'react';

interface UseGalleryNavigationOptions {
  initialIndex?: number;
  itemCount: number;
  embedded?: boolean;
  suppressDuringEditing?: boolean;
}

interface UseGalleryNavigationReturn {
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  navigateToIndex: (index: number) => void;
  handleNavigation: (direction: 'prev' | 'next') => void;
  handleCardClick: (index: number) => void;
  
  // Refs to attach to DOM elements
  listRef: RefObject<HTMLDivElement | null>;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  
  // Visibility state
  containerWidth: number;
  isHydrated: boolean;
  
  // Navigation state (for suppression during edits)
  isNavigating: boolean;
  isNavigatingRef: RefObject<boolean>;
  
  // Editing state
  isConfiguratorEditing: boolean;
  setIsConfiguratorEditing: (editing: boolean) => void;
}

const NAV_SUPPRESS_MS = 300;
const NAV_DELAY_MS = 50;

export function useGalleryNavigation({
  initialIndex = 1,
  itemCount,
  embedded = false,
}: UseGalleryNavigationOptions): UseGalleryNavigationReturn {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isConfiguratorEditing, setIsConfiguratorEditing] = useState(false);
  
  const listRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const isNavigatingRef = useRef(false);
  const navigationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const navDelayTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isConfiguratorEditingRef = useRef(false);

  useEffect(() => {
    isConfiguratorEditingRef.current = isConfiguratorEditing;
  }, [isConfiguratorEditing]);

  useEffect(() => {
    return () => {
      if (navigationTimeoutRef.current) clearTimeout(navigationTimeoutRef.current);
      if (navDelayTimeoutRef.current) clearTimeout(navDelayTimeoutRef.current);
    };
  }, []);

  // Hydration
  useEffect(() => {
    setIsHydrated(true);
    setContainerWidth(window.innerWidth);
  }, []);

  // Window resize
  useEffect(() => {
    if (!isHydrated) return;
    const handleResize = () => setContainerWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isHydrated]);

  // Container resize (e.g., when logs panel opens/closes)
  useEffect(() => {
    if (!isHydrated) return;
    const container = listRef.current?.parentElement?.parentElement as HTMLElement | null;
    if (!container || typeof ResizeObserver === 'undefined') return;
    
    const RESIZE_THRESHOLD = 50;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect?.width || container.getBoundingClientRect().width;
        if (w && Math.abs(w - containerWidth) > RESIZE_THRESHOLD) {
          setContainerWidth(w);
        }
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [isHydrated, containerWidth]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      ) return;

      if (isConfiguratorEditingRef.current) return;

      const activeElement = document.activeElement;
      if (
        activeElement?.closest('[data-radix-popper-content-wrapper]') ||
        activeElement?.closest('.monaco-editor')
      ) return;

      if (e.key === 'ArrowLeft' && activeIndex > 0) {
        e.preventDefault();
        handleNavigation('prev');
      } else if (e.key === 'ArrowRight' && activeIndex < itemCount - 1) {
        e.preventDefault();
        handleNavigation('next');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeIndex, itemCount]);

  const navigateToIndex = useCallback((nextIndex: number) => {
    isNavigatingRef.current = true;
    if (navigationTimeoutRef.current) clearTimeout(navigationTimeoutRef.current);
    navigationTimeoutRef.current = setTimeout(() => {
      isNavigatingRef.current = false;
    }, NAV_SUPPRESS_MS);

    if (navDelayTimeoutRef.current) clearTimeout(navDelayTimeoutRef.current);
    navDelayTimeoutRef.current = setTimeout(() => {
      setActiveIndex(nextIndex);
      
      const container = listRef.current;
      const card = container?.children?.[nextIndex] as HTMLElement | undefined;
      if (container && card) {
        card.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }

      // Scroll to top
      if (embedded) {
        let scrollParent = scrollContainerRef.current?.parentElement;
        while (scrollParent && scrollParent !== document.body) {
          const { overflowY } = window.getComputedStyle(scrollParent);
          if (overflowY === 'auto' || overflowY === 'scroll') {
            scrollParent.scrollTo({ top: 0, behavior: 'smooth' });
            break;
          }
          scrollParent = scrollParent.parentElement;
        }
        if (!scrollParent || scrollParent === document.body) {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } else if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, NAV_DELAY_MS);
  }, [embedded]);

  const handleNavigation = useCallback((direction: 'prev' | 'next') => {
    if (isConfiguratorEditingRef.current) return;
    const newIndex = direction === 'prev'
      ? Math.max(0, activeIndex - 1)
      : Math.min(itemCount - 1, activeIndex + 1);
    if (newIndex === activeIndex) return;
    navigateToIndex(newIndex);
  }, [activeIndex, itemCount, navigateToIndex]);

  const handleCardClick = useCallback((globalIndex: number) => {
    if (isConfiguratorEditingRef.current) return;
    navigateToIndex(globalIndex);
  }, [navigateToIndex]);

  return {
    activeIndex,
    setActiveIndex,
    navigateToIndex,
    handleNavigation,
    handleCardClick,
    listRef,
    scrollContainerRef,
    containerWidth,
    isHydrated,
    isNavigating: isNavigatingRef.current,
    isNavigatingRef,
    isConfiguratorEditing,
    setIsConfiguratorEditing,
  };
}

