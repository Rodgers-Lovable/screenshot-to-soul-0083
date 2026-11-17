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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      attachments: {
        Row: {
          event_id: string
          file_name: string
          file_url: string
          id: string
          label: string | null
          mime_type: string
          size_bytes: number
          uploaded_at: string
        }
        Insert: {
          event_id: string
          file_name: string
          file_url: string
          id: string
          label?: string | null
          mime_type?: string
          size_bytes?: number
          uploaded_at: string
        }
        Update: {
          event_id?: string
          file_name?: string
          file_url?: string
          id?: string
          label?: string | null
          mime_type?: string
          size_bytes?: number
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "budget_events"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          changed_at: string
          changed_by: string
          entity: string
          entity_id: string
          field: string
          id: string
          new_value: string | null
          old_value: string | null
        }
        Insert: {
          changed_at: string
          changed_by: string
          entity: string
          entity_id: string
          field: string
          id: string
          new_value?: string | null
          old_value?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string
          entity?: string
          entity_id?: string
          field?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Relationships: []
      }
      budget_events: {
        Row: {
          actual_date: string | null
          actual_duration: number | null
          actual_quantity: number | null
          actual_unit_cost_cents: number | null
          id: string
          line_id: string
          location: string | null
          notes: string | null
          planned_date: string | null
          sequence: number
          status: string
          title: string
        }
        Insert: {
          actual_date?: string | null
          actual_duration?: number | null
          actual_quantity?: number | null
          actual_unit_cost_cents?: number | null
          id: string
          line_id: string
          location?: string | null
          notes?: string | null
          planned_date?: string | null
          sequence: number
          status?: string
          title: string
        }
        Update: {
          actual_date?: string | null
          actual_duration?: number | null
          actual_quantity?: number | null
          actual_unit_cost_cents?: number | null
          id?: string
          line_id?: string
          location?: string | null
          notes?: string | null
          planned_date?: string | null
          sequence?: number
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_events_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "budget_lines"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_lines: {
        Row: {
          component_id: string
          cost_category: string | null
          description: string
          duration: number
          duration_unit: string
          finance_posted_cents: number | null
          group_label: string | null
          id: string
          justification: string | null
          occurrences: number
          quantity: number
          quantity_unit: string
          sort_order: number
          unit_cost_cents: number
        }
        Insert: {
          component_id: string
          cost_category?: string | null
          description: string
          duration: number
          duration_unit: string
          finance_posted_cents?: number | null
          group_label?: string | null
          id: string
          justification?: string | null
          occurrences: number
          quantity: number
          quantity_unit: string
          sort_order?: number
          unit_cost_cents: number
        }
        Update: {
          component_id?: string
          cost_category?: string | null
          description?: string
          duration?: number
          duration_unit?: string
          finance_posted_cents?: number | null
          group_label?: string | null
          id?: string
          justification?: string | null
          occurrences?: number
          quantity?: number
          quantity_unit?: string
          sort_order?: number
          unit_cost_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "budget_lines_component_id_fkey"
            columns: ["component_id"]
            isOneToOne: false
            referencedRelation: "components"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_periods: {
        Row: {
          end_date: string
          fx_rate: number
          id: string
          name: string
          project_name: string
          start_date: string
        }
        Insert: {
          end_date?: string
          fx_rate?: number
          id: string
          name?: string
          project_name?: string
          start_date?: string
        }
        Update: {
          end_date?: string
          fx_rate?: number
          id?: string
          name?: string
          project_name?: string
          start_date?: string
        }
        Relationships: []
      }
      components: {
        Row: {
          code: string
          id: string
          name: string
          period_id: string
          sort_order: number
        }
        Insert: {
          code?: string
          id: string
          name: string
          period_id: string
          sort_order?: number
        }
        Update: {
          code?: string
          id?: string
          name?: string
          period_id?: string
          sort_order?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
