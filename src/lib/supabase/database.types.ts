// Generated from the Supabase schema. Do not edit by hand; regenerate with `npm run db:types`.

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
      admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      booking_access_tokens: {
        Row: {
          booking_id: string
          created_at: string
          expires_at: string
          id: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          expires_at: string
          id?: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_access_tokens_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_artwork: {
        Row: {
          booking_id: string
          byte_size: number | null
          content_type: string | null
          created_at: string
          crop_height: number | null
          crop_width: number | null
          crop_x: number | null
          crop_y: number | null
          height_px: number | null
          id: string
          status: string
          storage_path: string
          updated_at: string
          width_px: number | null
          zoom: number | null
        }
        Insert: {
          booking_id: string
          byte_size?: number | null
          content_type?: string | null
          created_at?: string
          crop_height?: number | null
          crop_width?: number | null
          crop_x?: number | null
          crop_y?: number | null
          height_px?: number | null
          id?: string
          status?: string
          storage_path: string
          updated_at?: string
          width_px?: number | null
          zoom?: number | null
        }
        Update: {
          booking_id?: string
          byte_size?: number | null
          content_type?: string | null
          created_at?: string
          crop_height?: number | null
          crop_width?: number | null
          crop_x?: number | null
          crop_y?: number | null
          height_px?: number | null
          id?: string
          status?: string
          storage_path?: string
          updated_at?: string
          width_px?: number | null
          zoom?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_artwork_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_contacts: {
        Row: {
          booking_id: string
          business_name: string
          category: string | null
          contact_name: string
          created_at: string
          email: string
          phone: string
          updated_at: string
          website: string | null
        }
        Insert: {
          booking_id: string
          business_name: string
          category?: string | null
          contact_name: string
          created_at?: string
          email: string
          phone: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          booking_id?: string
          business_name?: string
          category?: string | null
          contact_name?: string
          created_at?: string
          email?: string
          phone?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_contacts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_slots: {
        Row: {
          booking_id: string
          released_at: string | null
          slot_id: string
        }
        Insert: {
          booking_id: string
          released_at?: string | null
          slot_id: string
        }
        Update: {
          booking_id?: string
          released_at?: string | null
          slot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_slots_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_slots_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "slot_availability"
            referencedColumns: ["slot_id"]
          },
          {
            foreignKeyName: "booking_slots_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "slot_pairs"
            referencedColumns: ["left_slot_id"]
          },
          {
            foreignKeyName: "booking_slots_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "slot_pairs"
            referencedColumns: ["right_slot_id"]
          },
          {
            foreignKeyName: "booking_slots_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "slots"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          confirmed_at: string | null
          created_at: string
          edition_id: string
          hold_expires_at: string | null
          hold_extensions: number
          hold_token_hash: string
          id: string
          price_cents: number
          pricing_mode: string
          reference: string | null
          size: string
          status: string
          stripe_customer_id: string | null
          stripe_payment_method_id: string | null
          stripe_setup_intent_id: string | null
          stripe_setup_status: string | null
          stripe_setup_status_at: string | null
          updated_at: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          edition_id: string
          hold_expires_at?: string | null
          hold_extensions?: number
          hold_token_hash: string
          id?: string
          price_cents: number
          pricing_mode?: string
          reference?: string | null
          size: string
          status?: string
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          stripe_setup_intent_id?: string | null
          stripe_setup_status?: string | null
          stripe_setup_status_at?: string | null
          updated_at?: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          edition_id?: string
          hold_expires_at?: string | null
          hold_extensions?: number
          hold_token_hash?: string
          id?: string
          price_cents?: number
          pricing_mode?: string
          reference?: string | null
          size?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          stripe_setup_intent_id?: string | null
          stripe_setup_status?: string | null
          stripe_setup_status_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "slot_availability"
            referencedColumns: ["edition_id"]
          },
          {
            foreignKeyName: "bookings_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "slot_pairs"
            referencedColumns: ["edition_id"]
          },
        ]
      }
      editions: {
        Row: {
          artwork_deadline: string
          created_at: string
          double_unit_price_cents: number | null
          id: string
          issue_month: string
          mail_date: string | null
          status: string
          unit_price_cents: number
          zone_id: string
        }
        Insert: {
          artwork_deadline: string
          created_at?: string
          double_unit_price_cents?: number | null
          id?: string
          issue_month: string
          mail_date?: string | null
          status?: string
          unit_price_cents?: number
          zone_id: string
        }
        Update: {
          artwork_deadline?: string
          created_at?: string
          double_unit_price_cents?: number | null
          id?: string
          issue_month?: string
          mail_date?: string | null
          status?: string
          unit_price_cents?: number
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "editions_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "zones"
            referencedColumns: ["id"]
          },
        ]
      }
      email_outbox: {
        Row: {
          attempts: number
          booking_id: string
          created_at: string
          id: string
          kind: string
          last_error: string | null
          next_attempt_at: string
          provider_message_id: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          booking_id: string
          created_at?: string
          id?: string
          kind: string
          last_error?: string | null
          next_attempt_at?: string
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          booking_id?: string
          created_at?: string
          id?: string
          kind?: string
          last_error?: string | null
          next_attempt_at?: string
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_outbox_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_consents: {
        Row: {
          amount_cents: number
          booking_id: string
          consented_at: string
          currency: string
          edition_id: string
          id: string
          pricing_mode: string
          stripe_setup_intent_id: string
          terms_version: string
        }
        Insert: {
          amount_cents: number
          booking_id: string
          consented_at?: string
          currency?: string
          edition_id: string
          id?: string
          pricing_mode?: string
          stripe_setup_intent_id: string
          terms_version: string
        }
        Update: {
          amount_cents?: number
          booking_id?: string
          consented_at?: string
          currency?: string
          edition_id?: string
          id?: string
          pricing_mode?: string
          stripe_setup_intent_id?: string
          terms_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_consents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_consents_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_consents_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "slot_availability"
            referencedColumns: ["edition_id"]
          },
          {
            foreignKeyName: "payment_consents_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "slot_pairs"
            referencedColumns: ["edition_id"]
          },
        ]
      }
      slots: {
        Row: {
          created_at: string
          edition_id: string
          height_in: number
          id: string
          label: string
          side: string
          width_in: number
          x_in: number
          y_in: number
        }
        Insert: {
          created_at?: string
          edition_id: string
          height_in: number
          id?: string
          label: string
          side: string
          width_in: number
          x_in: number
          y_in: number
        }
        Update: {
          created_at?: string
          edition_id?: string
          height_in?: number
          id?: string
          label?: string
          side?: string
          width_in?: number
          x_in?: number
          y_in?: number
        }
        Relationships: [
          {
            foreignKeyName: "slots_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slots_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "slot_availability"
            referencedColumns: ["edition_id"]
          },
          {
            foreignKeyName: "slots_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "slot_pairs"
            referencedColumns: ["edition_id"]
          },
        ]
      }
      stripe_events: {
        Row: {
          id: string
          received_at: string
          type: string
        }
        Insert: {
          id: string
          received_at?: string
          type: string
        }
        Update: {
          id?: string
          received_at?: string
          type?: string
        }
        Relationships: []
      }
      zones: {
        Row: {
          created_at: string
          household_count: number
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          household_count: number
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          household_count?: number
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
    }
    Views: {
      slot_availability: {
        Row: {
          artwork_deadline: string | null
          available: boolean | null
          edition_id: string | null
          height_in: number | null
          household_count: number | null
          issue_month: string | null
          label: string | null
          occupancy: string | null
          side: string | null
          slot_id: string | null
          unit_price_cents: number | null
          width_in: number | null
          x_in: number | null
          y_in: number | null
          zone_name: string | null
          zone_slug: string | null
        }
        Relationships: []
      }
      slot_pairs: {
        Row: {
          available: boolean | null
          double_unit_price_cents: number | null
          edition_id: string | null
          left_slot_id: string | null
          right_slot_id: string | null
          side: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      confirm_booking: {
        Args: {
          p_booking_id: string
          p_payment_method_id: string
          p_reference: string
          p_setup_intent_id: string
        }
        Returns: string
      }
      extend_hold: { Args: { p_token_hash: string }; Returns: string }
      note_hold_attempt: {
        Args: {
          p_max: number
          p_visitor_hash: string
          p_window_seconds: number
        }
        Returns: boolean
      }
      hold_slots: {
        Args: {
          p_double_price_cents: number | null
          p_pricing_mode: string
          p_slot_ids: string[]
          p_token_hash: string
          p_unit_price_cents: number
        }
        Returns: {
          booking_id: string
          hold_expires_at: string
          price_cents: number
          size: string
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
