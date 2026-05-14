import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { collection, getDocs, query, orderBy, setDoc, doc, serverTimestamp, where, deleteDoc, getDoc } from "firebase/firestore";
import { db } from "@/services/firestore/client";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_app/users")({
  component: UsersPage,
});

function UsersPage() {
  const { role, loading } = useAuth();
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingUid, setDeletingUid] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
  });

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users-list"],
    enabled: !loading && role === "admin",
    queryFn: async () => {
      const q = query(collection(db, "users"), orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          fullName: data.fullName,
          email: data.email,
          phone: data.phone,
          isActive: data.isActive ?? true,
          createdAt: data.createdAt?.toDate?.() || new Date(),
          role: data.role || "telecaller",
          password: data.password ?? null,
        };
      });
    },
  });

  const { data: archivedUsers = [], isLoading: isLoadingArchived } = useQuery({
    queryKey: ["archived-users-list"],
    enabled: !loading && role === "admin",
    queryFn: async () => {
      const q = query(collection(db, "archived_users"), orderBy("archivedAt", "desc"));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          fullName: data.fullName,
          email: data.email,
          phone: data.phone,
          archivedAt: data.archivedAt?.toDate?.() || new Date(),
          role: data.role || "telecaller",
          password: data.password ?? null,
        };
      });
    },
  });

  if (!loading && role !== "admin") return <Navigate to="/dashboard" />;

  const handleAddTelecaller = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const usersRef = collection(db, "users");
      const qCheck = query(usersRef, where("email", "==", formData.email));
      const checkSnapshot = await getDocs(qCheck);
      if (!checkSnapshot.empty) {
        throw new Error("A user with this email already exists.");
      }

      const newId = "tc_" + Math.random().toString(36).substring(2, 11);
      await setDoc(doc(db, "users", newId), {
        fullName: formData.fullName,
        email: formData.email,
        phone: formData.phone,
        password: formData.password,
        role: "telecaller",
        isActive: true,
        createdAt: serverTimestamp(),
      });

      toast.success("Telecaller created successfully!");
      setIsAdding(false);
      setFormData({ fullName: "", email: "", phone: "", password: "" });
      queryClient.invalidateQueries({ queryKey: ["users-list"] });
    } catch (error: any) {
      toast.error(error.message || "Failed to create telecaller");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestoreUser = async (uid: string) => {
    setIsSubmitting(true);
    try {
      const archRef = doc(db, "archived_users", uid);
      const archSnap = await getDoc(archRef);
      if (!archSnap.exists()) throw new Error("Archived record not found");

      const data = archSnap.data();
      // Move back to active users
      await setDoc(doc(db, "users", uid), {
        ...data,
        isActive: true,
        restoredAt: serverTimestamp(),
        // clean up archive fields
        archivedAt: null,
        archiveStatus: null
      });

      // Delete from archive
      await deleteDoc(archRef);

      toast.success("User restored to active duty!");
      queryClient.invalidateQueries({ queryKey: ["users-list"] });
      queryClient.invalidateQueries({ queryKey: ["archived-users-list"] });
    } catch (error: any) {
      toast.error(error.message || "Failed to restore user");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTelecaller = async (uid: string, name: string, email: string) => {
    if (!window.confirm(`Archive User: ${name || email}?\n\nAccess will be revoked, and pending leads will be unassigned. The user's record will be kept in the Archived tab for historical tracking.`)) {
      return;
    }
    
    setDeletingUid(uid);
    try {
      const userRef = doc(db, "users", uid);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) throw new Error("User not found");
      const userData = userSnap.data();

      // Automatic Reassignment (Unassign pending work)
      const leadsRef = collection(db, "leads");
      const qLeads = query(leadsRef, where("assignedTo", "==", uid));
      const leadsSnap = await getDocs(qLeads);
      if (!leadsSnap.empty) {
        for (const leadDoc of leadsSnap.docs) {
          const lData = leadDoc.data();
          if (["Assigned", "In Progress", "Follow-Up"].includes(lData.leadStatus)) {
            await setDoc(doc(db, "leads", leadDoc.id), {
              assignedTo: null,
              assignedAt: null,
              leadStatus: "Unassigned"
            }, { merge: true });
          }
        }
      }

      // ALWAYS ARCHIVE (Never permanent delete)
      await setDoc(doc(db, "archived_users", uid), {
        ...userData,
        isActive: false,
        archivedAt: serverTimestamp(),
        archiveStatus: "archived"
      });
      await deleteDoc(userRef);

      toast.success("User moved to Archive. Pending leads were unassigned.");
      queryClient.invalidateQueries({ queryKey: ["users-list"] });
      queryClient.invalidateQueries({ queryKey: ["archived-users-list"] });
    } catch (error: any) {
      toast.error(error.message || "Failed to archive user");
    } finally {
      setDeletingUid(null);
    }
  };

  return (
    <div className="space-y-5 relative">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">User Management</h2>
          <p className="text-sm text-muted-foreground">
            Manage your active team and archived records.
          </p>
        </div>
        <Button onClick={() => setIsAdding(true)} className="gap-2 shadow-soft">
          <Plus className="h-4 w-4" /> Add Telecaller
        </Button>
      </div>

      <Tabs defaultValue="active" className="w-full">
        <TabsList className="grid w-full max-w-xs grid-cols-2">
          <TabsTrigger value="active">Active Team ({users.length})</TabsTrigger>
          <TabsTrigger value="archived">Archived ({archivedUsers.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4">
          <div className="rounded-xl border bg-card shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium hidden md:table-cell">Phone</th>
                    <th className="px-4 py-3 font-medium">Password</th>
                    <th className="px-4 py-3 font-medium">Role</th>
                    <th className="px-4 py-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {isLoading && (
                    <tr><td colSpan={5} className="p-10 text-center">Loading…</td></tr>
                  )}
                  {!isLoading && users.length === 0 && (
                    <tr><td colSpan={5} className="p-10 text-center text-muted-foreground">No active telecallers.</td></tr>
                  )}
                  {users.map((u: any) => (
                    <tr key={u.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-accent text-white text-xs font-semibold">
                            {(u.fullName || u.email || "U").charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-sm">{u.fullName || "—"}</div>
                            <div className="text-xs text-muted-foreground">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">{u.phone || "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs">{u.password || "—"}</td>
                      <td className="px-4 py-3">
                        <Badge variant={u.role === "admin" ? "default" : "secondary"} className="capitalize text-[10px]">
                          {u.role}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {u.role === "telecaller" && (
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-7 text-[10px] gap-1"
                            disabled={deletingUid === u.id}
                            onClick={() => handleDeleteTelecaller(u.id, u.fullName, u.email)}
                          >
                            {deletingUid === u.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                            Archive
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="archived" className="mt-4">
          <div className="rounded-xl border bg-card shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Phone</th>
                    <th className="px-4 py-3 font-medium">Archived At</th>
                    <th className="px-4 py-3 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {isLoadingArchived && (
                    <tr><td colSpan={4} className="p-10 text-center">Loading…</td></tr>
                  )}
                  {!isLoadingArchived && archivedUsers.length === 0 && (
                    <tr><td colSpan={4} className="p-10 text-center text-muted-foreground">No archived records.</td></tr>
                  )}
                  {archivedUsers.map((u: any) => (
                    <tr key={u.id} className="hover:bg-muted/30 opacity-80">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 text-muted-foreground">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                            {(u.fullName || u.email || "U").charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-sm">{u.fullName || "—"}</div>
                            <div className="text-xs">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{u.phone || "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(u.archivedAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[10px] gap-1 text-success border-success/30 hover:bg-success/10"
                          onClick={() => handleRestoreUser(u.id)}
                        >
                          <RotateCcw className="h-3 w-3" />
                          Restore User
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {isAdding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-xl shadow-lg w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="font-semibold text-lg">Create Telecaller</h3>
              <Button variant="ghost" size="icon" onClick={() => setIsAdding(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <form onSubmit={handleAddTelecaller} className="p-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input id="fullName" required value={formData.fullName} onChange={(e) => setFormData({ ...formData, fullName: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Login Email</Label>
                <Input id="email" type="email" required value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Login Password</Label>
                <Input id="password" required minLength={6} value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number (Optional)</Label>
                <Input id="phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
              </div>
              <div className="pt-4 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsAdding(false)}>Cancel</Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create Account
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
