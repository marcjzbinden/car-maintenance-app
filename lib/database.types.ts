export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      garage_members: {
        Row: {
          created_at: string
          garage_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          garage_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          garage_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "garage_members_garage_id_fkey"
            columns: ["garage_id"]
            isOneToOne: false
            referencedRelation: "garages"
            referencedColumns: ["id"]
          },
        ]
      }
      garages: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      ideas: {
        Row: {
          category: string | null
          created_at: string | null
          created_by: string
          details: string | null
          garage_id: string | null
          id: string
          priority: string | null
          status: string | null
          title: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          created_by: string
          details?: string | null
          garage_id?: string | null
          id?: string
          priority?: string | null
          status?: string | null
          title: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          created_by?: string
          details?: string | null
          garage_id?: string | null
          id?: string
          priority?: string | null
          status?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "ideas_garage_id_fkey"
            columns: ["garage_id"]
            isOneToOne: false
            referencedRelation: "garages"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_item_documents: {
        Row: {
          document_id: string
          linked_at: string
          linked_by: string | null
          maintenance_item_id: string
          vehicle_id: string
        }
        Insert: {
          document_id: string
          linked_at?: string
          linked_by?: string | null
          maintenance_item_id: string
          vehicle_id: string
        }
        Update: {
          document_id?: string
          linked_at?: string
          linked_by?: string | null
          maintenance_item_id?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_item_documents_document_vehicle_fkey"
            columns: ["document_id", "vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicle_documents"
            referencedColumns: ["id", "vehicle_id"]
          },
          {
            foreignKeyName: "maintenance_item_documents_maintenance_vehicle_fkey"
            columns: ["maintenance_item_id", "vehicle_id"]
            isOneToOne: false
            referencedRelation: "maintenance_items"
            referencedColumns: ["id", "vehicle_id"]
          },
        ]
      }
      maintenance_items: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          garage_id: string
          id: string
          notes: string | null
          service_mileage: number | null
          title: string
          vehicle_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          garage_id: string
          id?: string
          notes?: string | null
          service_mileage?: number | null
          title: string
          vehicle_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          garage_id?: string
          id?: string
          notes?: string | null
          service_mileage?: number | null
          title?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_items_garage_id_fkey"
            columns: ["garage_id"]
            isOneToOne: false
            referencedRelation: "garages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_items_vehicle_garage_id_fkey"
            columns: ["vehicle_id", "garage_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id", "garage_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      vehicle_document_reviews: {
        Row: {
          completed_work: string[]
          document_date: string | null
          document_id: string
          document_type: string
          expiration_date: string | null
          mileage: number | null
          provider: string | null
          recommendations: string[]
          reviewed_at: string
          reviewed_by: string | null
          total_cost: number | null
        }
        Insert: {
          completed_work?: string[]
          document_date?: string | null
          document_id: string
          document_type: string
          expiration_date?: string | null
          mileage?: number | null
          provider?: string | null
          recommendations?: string[]
          reviewed_at: string
          reviewed_by?: string | null
          total_cost?: number | null
        }
        Update: {
          completed_work?: string[]
          document_date?: string | null
          document_id?: string
          document_type?: string
          expiration_date?: string | null
          mileage?: number | null
          provider?: string | null
          recommendations?: string[]
          reviewed_at?: string
          reviewed_by?: string | null
          total_cost?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_document_reviews_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "vehicle_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_documents: {
        Row: {
          created_at: string
          document_date: string | null
          document_type: string | null
          filename: string
          garage_id: string
          id: string
          mime_type: string
          storage_path: string
          uploaded_by: string | null
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          document_date?: string | null
          document_type?: string | null
          filename: string
          garage_id: string
          id?: string
          mime_type: string
          storage_path: string
          uploaded_by?: string | null
          vehicle_id: string
        }
        Update: {
          created_at?: string
          document_date?: string | null
          document_type?: string | null
          filename?: string
          garage_id?: string
          id?: string
          mime_type?: string
          storage_path?: string
          uploaded_by?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_documents_garage_id_fkey"
            columns: ["garage_id"]
            isOneToOne: false
            referencedRelation: "garages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_documents_vehicle_garage_id_fkey"
            columns: ["vehicle_id", "garage_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id", "garage_id"]
          },
        ]
      }
      vehicles: {
        Row: {
          created_at: string
          created_by: string | null
          garage_id: string
          id: string
          make: string | null
          model: string | null
          nickname: string
          owner_id: string | null
          year: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          garage_id: string
          id?: string
          make?: string | null
          model?: string | null
          nickname: string
          owner_id?: string | null
          year?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          garage_id?: string
          id?: string
          make?: string | null
          model?: string | null
          nickname?: string
          owner_id?: string | null
          year?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_garage_id_fkey"
            columns: ["garage_id"]
            isOneToOne: false
            referencedRelation: "garages"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ensure_user_setup: { Args: never; Returns: string }
      is_garage_member: { Args: { p_garage_id: string }; Returns: boolean }
      is_garage_owner: { Args: { p_garage_id: string }; Returns: boolean }
      remove_garage_member: {
        Args: { p_garage_id: string; p_user_id: string }
        Returns: undefined
      }
      set_garage_member_role: {
        Args: { p_garage_id: string; p_role: string; p_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
