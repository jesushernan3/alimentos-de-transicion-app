/**
 * Tipo mínimo de la base local.
 *
 * Se declara aquí, en lugar de importarlo del paquete nativo, para que ningún
 * módulo compartido entre plataformas tenga que depender de `expo-sqlite`.
 */
export interface LocalDatabase {
  execAsync(source: string): Promise<void>;
  getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null>;
  getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]>;
  runAsync(source: string, ...params: unknown[]): Promise<unknown>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
  closeAsync(): Promise<void>;
}

