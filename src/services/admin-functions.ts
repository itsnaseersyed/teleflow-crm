/**
 * ADMIN FUNCTIONS (DEPRECATED)
 * 
 * Note: User management logic has been migrated to the client-side 
 * in 'src/routes/_app.users.tsx' using the Hybrid Auth model.
 * 
 * This avoids the need for Firebase Admin SDK credentials and 
 * provides a simpler Firestore-only management experience.
 */

export const deleteUserFn = async () => {
  console.warn("deleteUserFn is deprecated. Use client-side logic in _app.users.tsx");
  return { success: false, message: "Deprecated" };
};
