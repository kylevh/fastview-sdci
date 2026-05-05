import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { readJsonFile, writeJsonFile } from "./file-store.js";

export type User = {
  id: string;
  email: string;
  passwordHash: string;
  token: string;
  createdAt: string;
};

type UsersDb = {
  users: User[];
};

const USERS_FILE = "users.json";

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function newToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export async function getUsersDb(): Promise<UsersDb> {
  return readJsonFile<UsersDb>(USERS_FILE, { users: [] });
}

export async function saveUsersDb(db: UsersDb): Promise<void> {
  await writeJsonFile(USERS_FILE, db);
}

export async function registerUser(email: string, password: string): Promise<User> {
  const db = await getUsersDb();
  const norm = normalizeEmail(email);
  const existing = db.users.find((u) => u.email === norm);
  if (existing) throw new Error("Email already registered");

  const passwordHash = await bcrypt.hash(password, 10);
  const user: User = {
    id: crypto.randomUUID(),
    email: norm,
    passwordHash,
    token: newToken(),
    createdAt: nowIso(),
  };

  db.users.push(user);
  await saveUsersDb(db);
  return user;
}

export async function loginUser(email: string, password: string): Promise<User> {
  const db = await getUsersDb();
  const norm = normalizeEmail(email);
  const user = db.users.find((u) => u.email === norm);
  if (!user) throw new Error("Invalid email or password");

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new Error("Invalid email or password");

  // Rotate token on login (simple revocation model).
  user.token = newToken();
  await saveUsersDb(db);
  return user;
}

export async function getUserByToken(token: string): Promise<User | null> {
  const db = await getUsersDb();
  return db.users.find((u) => u.token === token) ?? null;
}

