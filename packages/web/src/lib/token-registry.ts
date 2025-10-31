type Listener = () => void;

// Token registry holding the token for the superglue backend (core). 
// This avoids visible UI re-renders when updating and propagating the token to the child components.
class TokenRegistry {
  private _token: string | null = null;
  private listeners: Set<Listener> = new Set();

  setToken(next: string | null) {
    if (this._token === next) return;
    this._token = next;
    
    // Defer notifications to avoid setState during another component's render
    Promise.resolve().then(() => {
      for (const l of this.listeners) l();
    });
  }

  getToken(): string | null {
    return this._token ?? null;
  }

  hasToken(): boolean {
    return !!this._token;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const tokenRegistry = new TokenRegistry();