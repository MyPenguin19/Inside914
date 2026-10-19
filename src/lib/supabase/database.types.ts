export type ZoneChargeRow = { stripe_mode: "test" | "live"; stripe_account_id: string | null; id: string; booking_id: string; edition_id: string; consent_id: string; amount_cents: number; customer_id: string; payment_method_id: string; payment_intent_id: string | null; status: string; created_at: string; updated_at: string; created_by: string; recovery_hash: string | null; recovery_expires_at: string | null; last_event_at: number; failure_code: string | null };
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
      zone_charges: { Row: ZoneChargeRow; Insert: Partial<ZoneChargeRow>; Update: Partial<ZoneChargeRow>; Relationships: [] };
      zone_payment_events: { Row: {id:string;charge_id:string;created_at:string}; Insert: {id:string;charge_id:string;created_at?:string}; Update: {id?:string;charge_id?:string;created_at?:string}; Relationships: [] };

      advertising_categories: {
        Row: { id: string; name: string }
        Insert: { id: string; name: string }
        Update: { id?: string; name?: string }
        Relationships: []
      }
      recurring_plans: {
        Row: { id:string; user_id:string; name:string; source_booking_ids:string[]; start_month:string; end_month:string; interval_months:number; status:string; created_at:string; updated_at:string }
        Insert: { id?:string; user_id:string; name:string; source_booking_ids:string[]; start_month:string; end_month:string; interval_months:number; status?:string; created_at?:string; updated_at?:string }
        Update: { status?:string; updated_at?:string }
        Relationships: []
      }
      recurring_occurrences: {
        Row: { plan_id:string; issue_month:string; cart_id:string; nonce:string; created_at:string }
        Insert: { plan_id:string; issue_month:string; cart_id:string; nonce:string; created_at?:string }
        Update: { cart_id?:string; nonce?:string }
        Relationships: []
      }

      advertiser_email_verifications: {
        Row: { user_id:string; verified_email:string; verified_at:string }
        Insert: { user_id:string; verified_email:string; verified_at?:string }
        Update: { verified_email?:string; verified_at?:string }
        Relationships: []
      }
      advertiser_bookings: {
        Row: { booking_id: string; user_id: string; created_at: string }
        Insert: { booking_id: string; user_id: string; created_at?: string }
        Update: { booking_id?: string; user_id?: string; created_at?: string }
        Relationships: []
      }
      advertiser_artwork_drafts: {
        Row: { id:string; booking_id:string; user_id:string; storage_path:string; base_updated_at:string|null; status:string; content_type:string|null; byte_size:number|null; width_px:number|null; height_px:number|null; created_at:string }
        Insert: { id?:string; booking_id:string; user_id:string; storage_path:string; base_updated_at?:string|null; status?:string; content_type?:string|null; byte_size?:number|null; width_px?:number|null; height_px?:number|null; created_at?:string }
        Update: { status?:string; content_type?:string|null; byte_size?:number|null; width_px?:number|null; height_px?:number|null }
        Relationships: []
      }
      reservation_carts: {
        Row: { id: string; token_hash: string; created_at: string }
        Insert: { id?: string; token_hash: string; created_at?: string }
        Update: { id?: string; token_hash?: string; created_at?: string }
        Relationships: []
      }
      admin_events: {
        Row: {
          admin_user_id: string | null
          created_at: string
          details: Json
          event_type: string
          id: number
          target_id: string
          target_type: string
        }
        Insert: {
          admin_user_id?: string | null
          created_at?: string
          details?: Json
          event_type: string
          id?: never
          target_id: string
          target_type: string
        }
        Update: {
          admin_user_id?: string | null
          created_at?: string
          details?: Json
          event_type?: string
          id?: never
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
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
      artwork_reviews: {
        Row: {
          admin_user_id: string
          artwork_id: string | null
          booking_id: string
          created_at: string
          decision: string
          id: string
          note: string | null
          storage_path: string
        }
        Insert: {
          admin_user_id: string
          artwork_id?: string | null
          booking_id: string
          created_at?: string
          decision: string
          id?: string
          note?: string | null
          storage_path: string
        }
        Update: {
          admin_user_id?: string
          artwork_id?: string | null
          booking_id?: string
          created_at?: string
          decision?: string
          id?: string
          note?: string | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "artwork_reviews_artwork_id_fkey"
            columns: ["artwork_id"]
            isOneToOne: false
            referencedRelation: "booking_artwork"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artwork_reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
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
          shared_source_id: string | null
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
          review_note: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          storage_path: string
          updated_at: string
          width_px: number | null
          zoom: number | null
        }
        Insert: {
          shared_source_id?: string | null
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
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_path: string
          updated_at?: string
          width_px?: number | null
          zoom?: number | null
        }
        Update: {
          shared_source_id?: string | null
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
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
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
      booking_notes: {
        Row: {
          author_id: string
          body: string
          booking_id: string
          created_at: string
          id: string
        }
        Insert: {
          author_id: string
          body: string
          booking_id: string
          created_at?: string
          id?: string
        }
        Update: {
          author_id?: string
          body?: string
          booking_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_notes_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
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
          category_id: string | null
          cart_id: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          card_removed_at: string | null
          confirmed_at: string | null
          created_at: string
          edition_id: string
          flag_reason: string | null
          flagged_at: string | null
          flagged_by: string | null
          hold_expires_at: string | null
          hold_extensions: number
          hold_token_hash: string
          id: string
          price_cents: number
          pricing_mode: string
          reference: string | null
          claimed_slot_count: number | null
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
          cart_id?: string | null
          category_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          card_removed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          edition_id: string
          flag_reason?: string | null
          flagged_at?: string | null
          flagged_by?: string | null
          hold_expires_at?: string | null
          hold_extensions?: number
          hold_token_hash: string
          id?: string
          price_cents: number
          pricing_mode?: string
          reference?: string | null
          claimed_slot_count?: number | null
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
          cart_id?: string | null
          category_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          card_removed_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          edition_id?: string
          flag_reason?: string | null
          flagged_at?: string | null
          flagged_by?: string | null
          hold_expires_at?: string | null
          hold_extensions?: number
          hold_token_hash?: string
          id?: string
          price_cents?: number
          pricing_mode?: string
          reference?: string | null
          claimed_slot_count?: number | null
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
          product_model: string
          category_exclusivity: boolean
          artwork_deadline: string
          artwork_due_at: string | null
          created_at: string
          double_unit_price_cents: number | null
          id: string
          issue_month: string
          layout_template: string | null
          mail_date: string | null
          mailing_window_end: string | null
          mailing_window_start: string | null
          name: string | null
          reservations_open_at: string | null
          reservations_paused_at: string | null
          status: string
          target_quantity: number | null
          unit_price_cents: number
          updated_at: string
          zone_id: string
        }
        Insert: {
          artwork_deadline: string
          product_model?: string
          category_exclusivity?: boolean
          artwork_due_at?: string | null
          created_at?: string
          double_unit_price_cents?: number | null
          id?: string
          issue_month: string
          layout_template?: string | null
          mail_date?: string | null
          mailing_window_end?: string | null
          mailing_window_start?: string | null
          name?: string | null
          reservations_open_at?: string | null
          reservations_paused_at?: string | null
          status?: string
          target_quantity?: number | null
          unit_price_cents?: number
          updated_at?: string
          zone_id: string
        }
        Update: {
          artwork_deadline?: string
          product_model?: string
          category_exclusivity?: boolean
          artwork_due_at?: string | null
          created_at?: string
          double_unit_price_cents?: number | null
          id?: string
          issue_month?: string
          layout_template?: string | null
          mail_date?: string | null
          mailing_window_end?: string | null
          mailing_window_start?: string | null
          name?: string | null
          reservations_open_at?: string | null
          reservations_paused_at?: string | null
          status?: string
          target_quantity?: number | null
          unit_price_cents?: number
          updated_at?: string
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
      mailing_evidence: {
        Row: {
          byte_size: number | null
          content_type: string | null
          edition_id: string
          event_date: string | null
          id: string
          kind: string
          notes: string | null
          published_at: string | null
          published_by: string | null
          quantity_accepted: number | null
          quantity_printed: number | null
          storage_path: string | null
          title: string
          uploaded_at: string
          uploaded_by: string
        }
        Insert: {
          byte_size?: number | null
          content_type?: string | null
          edition_id: string
          event_date?: string | null
          id?: string
          kind: string
          notes?: string | null
          published_at?: string | null
          published_by?: string | null
          quantity_accepted?: number | null
          quantity_printed?: number | null
          storage_path?: string | null
          title: string
          uploaded_at?: string
          uploaded_by: string
        }
        Update: {
          byte_size?: number | null
          content_type?: string | null
          edition_id?: string
          event_date?: string | null
          id?: string
          kind?: string
          notes?: string | null
          published_at?: string | null
          published_by?: string | null
          quantity_accepted?: number | null
          quantity_printed?: number | null
          storage_path?: string | null
          title?: string
          uploaded_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "mailing_evidence_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "editions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mailing_evidence_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "slot_availability"
            referencedColumns: ["edition_id"]
          },
          {
            foreignKeyName: "mailing_evidence_edition_id_fkey"
            columns: ["edition_id"]
            isOneToOne: false
            referencedRelation: "slot_pairs"
            referencedColumns: ["edition_id"]
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
          blocked_at: string | null
          blocked_by: string | null
          blocked_reason: string | null
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
          blocked_at?: string | null
          blocked_by?: string | null
          blocked_reason?: string | null
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
          blocked_at?: string | null
          blocked_by?: string | null
          blocked_reason?: string | null
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
      category_availability: {
        Row: { edition_id: string | null; zone_id: string | null; category_id: string | null; category_name: string | null; occupancy: string | null }
        Relationships: []
      }
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
      admin_collection_preview: { Args: {p_id:string}; Returns: Json };
      admin_prepare_zone_collection: { Args: {p_id:string}; Returns: Json };
      bind_zone_collection: { Args: {p_id:string;p_mode:string;p_account:string}; Returns: undefined };
      record_zone_payment: { Args: {p_charge:string;p_intent:string;p_status:string;p_event:string;p_created:number;p_failure?:string;p_mode?:string;p_account?:string}; Returns:string };

      hold_category_cart: { Args: { p_category_id: string; p_token_hash: string; p_items: Json; p_pricing_mode: string }; Returns: string }
      admin_enable_campaign_categories: { Args: { p_edition_id: string }; Returns: string }
      recurring_plan_manage: { Args: { p_id:string; p_action:string; p:Json }; Returns:string }
      hold_recurring_occurrence: { Args: { p_user:string; p_plan:string; p_month:string; p_nonce:string; p_hash:string; p_items:Json; p_pricing_mode:string; p_expected_total:number }; Returns:Json }

      claim_advertiser_bookings: { Args: never; Returns: number }
      advertiser_manage: { Args: { p_booking:string; p_action:string; p:Json }; Returns:string }
      hold_cart: { Args: { p_token_hash: string; p_items: Json; p_pricing_mode: string }; Returns: string }
      confirm_cart: { Args: { p_cart_id: string; p_setup_intent_id: string; p_payment_method_id: string; p_references: Json }; Returns: string }
      admin_add_booking_note: {
        Args: { p_body: string; p_booking_id: string }
        Returns: string
      }
      admin_add_evidence: {
        Args: { p: Json; p_edition_id: string }
        Returns: string
      }
      admin_cancel_booking: {
        Args: { p_booking_id: string; p_reason: string }
        Returns: string
      }
      admin_save_zone: {
        Args: { p_id: string | null; p_name: string; p_slug: string; p_household_count: number }
        Returns: string
      }
      share_square_cart_artwork: { Args: { p_token_hash: string; p_source_id: string; p_version: string; p_targets: Json }; Returns: undefined }
      admin_create_square_campaign: { Args: { p: Json }; Returns: string }
      admin_create_campaign: {
        Args: { p: Json; p_slots: Json }
        Returns: string
      }
      admin_extend_deadline: {
        Args: { p: Json; p_id: string }
        Returns: string
      }
      admin_flag_booking: {
        // p_reason null clears the flag (hand-corrected: the generator types it as string only)
        Args: { p_booking_id: string; p_reason: string | null }
        Returns: string
      }
      admin_publish_evidence: {
        Args: { p_id: string; p_publish: boolean }
        Returns: string
      }
      admin_review_artwork: {
        Args: { p_artwork_id: string; p_decision: string; p_note?: string }
        Returns: string
      }
      admin_set_campaign_status: {
        Args: { p_action: string; p_id: string }
        Returns: string
      }
      admin_set_slot_block: {
        Args: { p_block: boolean; p_reason?: string; p_slot_id: string }
        Returns: string
      }
      admin_update_campaign: {
        Args: { p: Json; p_id: string }
        Returns: string
      }
      close_past_deadline_campaigns: { Args: never; Returns: number }
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
      hold_postcard: {
        Args: { p_slot_ids: string[]; p_size: string; p_token_hash: string; p_pricing_mode: string }
        Returns: { booking_id: string; hold_expires_at: string; size: string; price_cents: number }[]
      }
      hold_slots: {
        Args: {
          // null when the edition offers no double (hand-corrected: the generator types it as number)
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
      note_hold_attempt: {
        Args: {
          p_max: number
          p_visitor_hash: string
          p_window_seconds: number
        }
        Returns: boolean
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
