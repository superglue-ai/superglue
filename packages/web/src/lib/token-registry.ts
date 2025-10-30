type Listener = (token: string) => void;

// Token registry holding the token for the superglue backend (core). 
// This avoids visible UI re-renders when updating and propagating the token to the child components.
class TokenRegistry {
  private _token: string | undefined;
  private listeners: Set<Listener> = new Set();

  setToken(next: string) {
    if (this._token === next) return;
    this._token = next;
    for (const l of this.listeners) l(next);
  }

  getToken(): string {
    if (!this._token) {
      throw new Error('Cannot get the token before it is set');
    }

    return this._token;
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
