/** Native: the database is a file of this app only; nothing to recover by reloading. */
export function retryWithReload(): boolean {
  return false;
}

export function startupSucceeded(): void {}

export const canReloadPage = false;

export function reloadPage(): void {}

export async function afterUpdateReload(): Promise<void> {}
