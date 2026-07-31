export interface RyvomUser {
  id: string;
  email?: string;
  username?: string;
  role: "client" | "coach";
}