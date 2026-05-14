import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { doc, getDoc, updateDoc, setDoc, collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "@/services/firestore/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user, role, refreshRole } = useAuth();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [changingPw, setChangingPw] = useState(false);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setFullName(data.fullName ?? "");
        setPhone(data.phone ?? "");
      }
    });
  }, [user]);

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        fullName,
        phone,
      });
      toast.success("Profile updated");
      refreshRole();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (!user || !user.email) return;
    if (!currentPassword) {
      toast.error("Enter your current password to confirm");
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    setChangingPw(true);
    try {
      // Firebase requires recent sign-in — re-authenticate first
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(auth.currentUser!, credential);
      await updatePassword(auth.currentUser!, newPassword);
      
      // SYNC WITH FIRESTORE: Update the plaintext password field so admin can see it
      console.log("Searching for user document by email:", user.email);
      try {
        const usersRef = collection(db, "users");
        const q = query(usersRef, where("email", "==", user.email));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const userDoc = querySnapshot.docs[0];
          await setDoc(doc(db, "users", userDoc.id), {
            password: newPassword,
            passwordLastSynced: new Date()
          }, { merge: true });
          console.log("Firestore sync complete for doc:", userDoc.id);
        } else {
          // Fallback to UID if email query fails
          await setDoc(doc(db, "users", user.uid), {
            password: newPassword,
            passwordLastSynced: new Date()
          }, { merge: true });
        }
      } catch (fsError: any) {
        console.error("Firestore Sync Error:", fsError);
        throw new Error("Auth password changed, but failed to sync to database: " + fsError.message);
      }

      toast.success("Password updated successfully");
      setCurrentPassword("");
      setNewPassword("");
    } catch (e: any) {
      if (e.code === "auth/wrong-password" || e.code === "auth/invalid-credential") {
        toast.error("Current password is incorrect");
      } else {
        toast.error(e.message ?? "Failed to update password");
      }
    } finally {
      setChangingPw(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Settings</h2>
        <p className="text-sm text-muted-foreground">Manage your account and preferences.</p>
      </div>

      <section className="rounded-xl border bg-card shadow-card p-6 space-y-4">
        <h3 className="font-semibold">Profile</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Full name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={user?.email ?? ""} disabled />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Phone</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={saveProfile} disabled={saving} className="bg-gradient-accent text-white">
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </section>

      {role === "admin" && (
        <section className="rounded-xl border bg-card shadow-card p-6 space-y-4">
          <h3 className="font-semibold">Change password</h3>
          <p className="text-sm text-muted-foreground">
            You'll need to enter your current password to confirm.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Current password</Label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Your current password"
              />
            </div>
            <div className="space-y-2">
              <Label>New password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min. 6 characters"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={changePassword} disabled={changingPw}>
              {changingPw ? "Updating…" : "Update password"}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
