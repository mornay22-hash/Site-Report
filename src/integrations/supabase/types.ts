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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      entries: {
        Row: {
          category: string | null
          created_at: string
          description: string
          entry_number: number
          id: string
          item_name: string | null
          location: string | null
          priority: string | null
          recommendation: string | null
          report_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string
          entry_number: number
          id?: string
          item_name?: string | null
          location?: string | null
          priority?: string | null
          recommendation?: string | null
          report_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string
          entry_number?: number
          id?: string
          item_name?: string | null
          location?: string | null
          priority?: string | null
          recommendation?: string | null
          report_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entries_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_sections: {
        Row: {
          action_required: string | null
          area_description: string | null
          area_name: string
          area_slug: string
          assigned_to: string | null
          category: string | null
          comments: string | null
          created_at: string
          estimated_cost: number | null
          follow_up_required: boolean
          id: string
          is_ad_hoc: boolean
          next_photo_seq: number
          priority: string | null
          repair_description: string | null
          repairs_required: boolean
          report_id: string
          sort_order: number
          status: string | null
          target_completion_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          action_required?: string | null
          area_description?: string | null
          area_name: string
          area_slug?: string
          assigned_to?: string | null
          category?: string | null
          comments?: string | null
          created_at?: string
          estimated_cost?: number | null
          follow_up_required?: boolean
          id?: string
          is_ad_hoc?: boolean
          next_photo_seq?: number
          priority?: string | null
          repair_description?: string | null
          repairs_required?: boolean
          report_id: string
          sort_order?: number
          status?: string | null
          target_completion_date?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          action_required?: string | null
          area_description?: string | null
          area_name?: string
          area_slug?: string
          assigned_to?: string | null
          category?: string | null
          comments?: string | null
          created_at?: string
          estimated_cost?: number | null
          follow_up_required?: boolean
          id?: string
          is_ad_hoc?: boolean
          next_photo_seq?: number
          priority?: string | null
          repair_description?: string | null
          repairs_required?: boolean
          report_id?: string
          sort_order?: number
          status?: string | null
          target_completion_date?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_sections_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_template_items: {
        Row: {
          area_name: string
          id: string
          sort_order: number
          template_id: string
        }
        Insert: {
          area_name: string
          id?: string
          sort_order?: number
          template_id: string
        }
        Update: {
          area_name?: string
          id?: string
          sort_order?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "inspection_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      inspection_templates: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          is_system: boolean
          name: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          is_system?: boolean
          name: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          is_system?: boolean
          name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      photos: {
        Row: {
          caption: string | null
          entry_id: string | null
          file_size: number
          id: string
          image_path: string
          photo_number: string
          report_id: string
          section_id: string | null
          seq: number
          sort_order: number
          uploaded_at: string
          user_id: string
        }
        Insert: {
          caption?: string | null
          entry_id?: string | null
          file_size?: number
          id?: string
          image_path: string
          photo_number: string
          report_id: string
          section_id?: string | null
          seq: number
          sort_order?: number
          uploaded_at?: string
          user_id: string
        }
        Update: {
          caption?: string | null
          entry_id?: string | null
          file_size?: number
          id?: string
          image_path?: string
          photo_number?: string
          report_id?: string
          section_id?: string | null
          seq?: number
          sort_order?: number
          uploaded_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "photos_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "inspection_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      report_edits: {
        Row: {
          edited_at: string
          field: string
          id: string
          new_value: string | null
          previous_value: string | null
          report_id: string
          user_id: string
        }
        Insert: {
          edited_at?: string
          field: string
          id?: string
          new_value?: string | null
          previous_value?: string | null
          report_id: string
          user_id: string
        }
        Update: {
          edited_at?: string
          field?: string
          id?: string
          new_value?: string | null
          previous_value?: string | null
          report_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_edits_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          archived_at: string | null
          area: string | null
          client_name: string | null
          completed_at: string | null
          created_at: string
          due_date: string | null
          id: string
          inspection_time: string | null
          inspector_name: string | null
          next_entry_number: number
          next_photo_seq: number
          notes: string | null
          planned_visit_date: string | null
          report_date: string
          report_name: string
          report_type: string
          site_code: string
          site_name: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          area?: string | null
          client_name?: string | null
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          inspection_time?: string | null
          inspector_name?: string | null
          next_entry_number?: number
          next_photo_seq?: number
          notes?: string | null
          planned_visit_date?: string | null
          report_date?: string
          report_name: string
          report_type?: string
          site_code: string
          site_name: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          area?: string | null
          client_name?: string | null
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          inspection_time?: string | null
          inspector_name?: string | null
          next_entry_number?: number
          next_photo_seq?: number
          notes?: string | null
          planned_visit_date?: string | null
          report_date?: string
          report_name?: string
          report_type?: string
          site_code?: string
          site_name?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allocate_entry_number: { Args: { _report_id: string }; Returns: number }
      allocate_photo_number: {
        Args: { _report_id: string }
        Returns: {
          photo_number: string
          seq: number
        }[]
      }
      allocate_section_photo_number: {
        Args: { _section_id: string }
        Returns: {
          photo_number: string
          seq: number
        }[]
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
