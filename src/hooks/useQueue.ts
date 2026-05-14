import { useState, useEffect } from "react";
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  limit 
} from "firebase/firestore";
import { db } from "@/services/firestore/client";
import { Lead } from "@/services/firestore/types";

export function useQueue(userId?: string, status: string = "Assigned") {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    let q = query(
      collection(db, "leads"),
      where("assignedTo", "==", userId),
      where("leadStatus", "==", status),
      orderBy("createdAt", "desc"),
      limit(50) // Limited for realtime efficiency
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Lead));
      setLeads(data);
      setLoading(false);
    }, (error) => {
      console.error("Queue Listener Error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userId, status]);

  return { leads, loading };
}
