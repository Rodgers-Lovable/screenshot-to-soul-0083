export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      attachments: {
        Row: {
          event_id: string;
          file_name: string;
          file_url: string;
          id: string;
          label: string | null;
          mime_type: string;
          size_bytes: number;
          study_id: string;
          uploaded_at: string;
        };
        ComputedFields: never;
        Insert: {
          event_id: string;
          file_name: string;
          file_url: string;
          id: string;
          label?: string | null;
          mime_type?: string;
          size_bytes?: number;
          study_id: string;
          uploaded_at: string;
        };
        Update: {
          event_id?: string;
          file_name?: string;
          file_url?: string;
          id?: string;
          label?: string | null;
          mime_type?: string;
          size_bytes?: number;
          study_id?: string;
          uploaded_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "attachments_event_study_fkey";
            columns: ["event_id", "study_id"];
            isOneToOne: false;
            referencedRelation: "budget_events";
            referencedColumns: ["id", "study_id"];
          },
          {
            foreignKeyName: "attachments_study_id_fkey";
            columns: ["study_id"];
            isOneToOne: false;
            referencedRelation: "studies";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_log: {
        Row: {
          changed_at: string;
          changed_by: string;
          entity: string;
          entity_id: string;
          field: string;
          id: string;
          new_value: string | null;
          old_value: string | null;
          study_id: string;
        };
        ComputedFields: never;
        Insert: {
          changed_at: string;
          changed_by: string;
          entity: string;
          entity_id: string;
          field: string;
          id: string;
          new_value?: string | null;
          old_value?: string | null;
          study_id: string;
        };
        Update: {
          changed_at?: string;
          changed_by?: string;
          entity?: string;
          entity_id?: string;
          field?: string;
          id?: string;
          new_value?: string | null;
          old_value?: string | null;
          study_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_study_id_fkey";
            columns: ["study_id"];
            isOneToOne: false;
            referencedRelation: "studies";
            referencedColumns: ["id"];
          },
        ];
      };
      budget_events: {
        Row: {
          actual_date: string | null;
          actual_duration: number | null;
          actual_quantity: number | null;
          actual_unit_cost_cents: number | null;
          id: string;
          line_id: string;
          location: string | null;
          notes: string | null;
          planned_date: string | null;
          sequence: number;
          status: string;
          study_id: string;
          title: string;
        };
        ComputedFields: never;
        Insert: {
          actual_date?: string | null;
          actual_duration?: number | null;
          actual_quantity?: number | null;
          actual_unit_cost_cents?: number | null;
          id: string;
          line_id: string;
          location?: string | null;
          notes?: string | null;
          planned_date?: string | null;
          sequence: number;
          status?: string;
          study_id: string;
          title: string;
        };
        Update: {
          actual_date?: string | null;
          actual_duration?: number | null;
          actual_quantity?: number | null;
          actual_unit_cost_cents?: number | null;
          id?: string;
          line_id?: string;
          location?: string | null;
          notes?: string | null;
          planned_date?: string | null;
          sequence?: number;
          status?: string;
          study_id?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "budget_events_line_study_fkey";
            columns: ["line_id", "study_id"];
            isOneToOne: false;
            referencedRelation: "budget_lines";
            referencedColumns: ["id", "study_id"];
          },
          {
            foreignKeyName: "budget_events_study_id_fkey";
            columns: ["study_id"];
            isOneToOne: false;
            referencedRelation: "studies";
            referencedColumns: ["id"];
          },
        ];
      };
      budget_lines: {
        Row: {
          component_id: string;
          cost_category: string | null;
          description: string;
          duration: number;
          duration_unit: string;
          finance_posted_cents: number | null;
          group_label: string | null;
          id: string;
          justification: string | null;
          occurrences: number;
          quantity: number;
          quantity_unit: string;
          sort_order: number;
          study_id: string;
          unit_cost_cents: number;
        };
        ComputedFields: never;
        Insert: {
          component_id: string;
          cost_category?: string | null;
          description: string;
          duration: number;
          duration_unit: string;
          finance_posted_cents?: number | null;
          group_label?: string | null;
          id: string;
          justification?: string | null;
          occurrences: number;
          quantity: number;
          quantity_unit: string;
          sort_order?: number;
          study_id: string;
          unit_cost_cents: number;
        };
        Update: {
          component_id?: string;
          cost_category?: string | null;
          description?: string;
          duration?: number;
          duration_unit?: string;
          finance_posted_cents?: number | null;
          group_label?: string | null;
          id?: string;
          justification?: string | null;
          occurrences?: number;
          quantity?: number;
          quantity_unit?: string;
          sort_order?: number;
          study_id?: string;
          unit_cost_cents?: number;
        };
        Relationships: [
          {
            foreignKeyName: "budget_lines_component_study_fkey";
            columns: ["component_id", "study_id"];
            isOneToOne: false;
            referencedRelation: "components";
            referencedColumns: ["id", "study_id"];
          },
          {
            foreignKeyName: "budget_lines_study_id_fkey";
            columns: ["study_id"];
            isOneToOne: false;
            referencedRelation: "studies";
            referencedColumns: ["id"];
          },
        ];
      };
      budget_periods: {
        Row: {
          currency: string;
          end_date: string;
          fx_rate: number;
          id: string;
          name: string;
          project_name: string;
          start_date: string;
          status: string;
          study_id: string;
        };
        ComputedFields: never;
        Insert: {
          currency?: string;
          end_date?: string;
          fx_rate?: number;
          id: string;
          name?: string;
          project_name?: string;
          start_date?: string;
          status?: string;
          study_id: string;
        };
        Update: {
          currency?: string;
          end_date?: string;
          fx_rate?: number;
          id?: string;
          name?: string;
          project_name?: string;
          start_date?: string;
          status?: string;
          study_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "budget_periods_study_id_fkey";
            columns: ["study_id"];
            isOneToOne: false;
            referencedRelation: "studies";
            referencedColumns: ["id"];
          },
        ];
      };
      components: {
        Row: {
          code: string;
          id: string;
          name: string;
          period_id: string;
          sort_order: number;
          study_id: string;
        };
        ComputedFields: never;
        Insert: {
          code?: string;
          id: string;
          name: string;
          period_id: string;
          sort_order?: number;
          study_id: string;
        };
        Update: {
          code?: string;
          id?: string;
          name?: string;
          period_id?: string;
          sort_order?: number;
          study_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "components_period_study_fkey";
            columns: ["period_id", "study_id"];
            isOneToOne: false;
            referencedRelation: "budget_periods";
            referencedColumns: ["id", "study_id"];
          },
          {
            foreignKeyName: "components_study_id_fkey";
            columns: ["study_id"];
            isOneToOne: false;
            referencedRelation: "studies";
            referencedColumns: ["id"];
          },
        ];
      };
      legacy_evidence: {
        Row: {
          path: string;
          study_id: string;
        };
        ComputedFields: never;
        Insert: {
          path: string;
          study_id: string;
        };
        Update: {
          path?: string;
          study_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "legacy_evidence_study_id_fkey";
            columns: ["study_id"];
            isOneToOne: false;
            referencedRelation: "studies";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_admins: {
        Row: {
          added_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          added_at?: string;
          user_id: string;
        };
        Update: {
          added_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      studies: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      study_members: {
        Row: {
          added_at: string;
          email: string;
          role: string;
          study_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          added_at?: string;
          email?: string;
          role: string;
          study_id: string;
          user_id: string;
        };
        Update: {
          added_at?: string;
          email?: string;
          role?: string;
          study_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "study_members_study_id_fkey";
            columns: ["study_id"];
            isOneToOne: false;
            referencedRelation: "studies";
            referencedColumns: ["id"];
          },
        ];
      };
      team_members: {
        Row: {
          added_at: string;
          email: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          added_at?: string;
          email?: string;
          user_id: string;
        };
        Update: {
          added_at?: string;
          email?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      add_study_member: { Args: { _email: string; _study_id: string }; Returns: boolean };
      add_team_member: { Args: { _email: string }; Returns: boolean };
      can_access_evidence: { Args: { _name: string }; Returns: boolean };
      can_upload_evidence: { Args: { _name: string }; Returns: boolean };
      create_study: { Args: { _name: string }; Returns: string };
      has_role: {
        Args: { _role: Database["public"]["Enums"]["app_role"]; _user_id: string };
        Returns: boolean;
      };
      is_platform_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_study_admin: { Args: { _study_id: string }; Returns: boolean };
      is_study_member: { Args: { _study_id: string }; Returns: boolean };
      is_team_member: { Args: Record<PropertyKey, never>; Returns: boolean };
      join_team_if_empty: { Args: Record<PropertyKey, never>; Returns: boolean };
      remove_study_member: { Args: { _study_id: string; _user_id: string }; Returns: undefined };
      remove_team_member: { Args: { _user_id: string }; Returns: undefined };
      set_study_admin: {
        Args: { _is_admin: boolean; _study_id: string; _user_id: string };
        Returns: undefined;
      };
      set_team_admin: { Args: { _is_admin: boolean; _user_id: string }; Returns: undefined };
    };
    Enums: {
      app_role: "admin";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin"],
    },
  },
} as const;
