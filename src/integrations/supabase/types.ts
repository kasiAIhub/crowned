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
      bookings: {
        Row: {
          booked_at: string
          booked_by: string
          called_at: string | null
          chair_id: string | null
          checked_in: boolean
          child_age: number
          child_name: string
          code: string
          collected_at: string | null
          estimated_start: string | null
          finish_today_confirmed: boolean
          finished_at: string | null
          heads_up_attempt_at: string | null
          heads_up_sent_at: string | null
          id: string
          mani_pedi: boolean
          moved_note: string | null
          needs_wash: boolean
          note: string | null
          notify_error: string | null
          notify_status: string
          parent_name: string
          phone: string | null
          queue_order: number
          ready_attempt_at: string | null
          ready_sent_at: string | null
          salon_day_id: string
          service_id: string
          source: string
          started_at: string | null
          status: string
          waiting_pref: string | null
          whatsapp_consent: boolean
          whatsapp_consent_at: string | null
          whatsapp_number: string | null
        }
        Insert: {
          booked_at?: string
          booked_by: string
          called_at?: string | null
          chair_id?: string | null
          checked_in?: boolean
          child_age: number
          child_name: string
          code: string
          collected_at?: string | null
          estimated_start?: string | null
          finish_today_confirmed?: boolean
          finished_at?: string | null
          heads_up_attempt_at?: string | null
          heads_up_sent_at?: string | null
          id?: string
          mani_pedi?: boolean
          moved_note?: string | null
          needs_wash?: boolean
          note?: string | null
          notify_error?: string | null
          notify_status?: string
          parent_name: string
          phone?: string | null
          queue_order: number
          ready_attempt_at?: string | null
          ready_sent_at?: string | null
          salon_day_id: string
          service_id: string
          source: string
          started_at?: string | null
          status?: string
          waiting_pref?: string | null
          whatsapp_consent?: boolean
          whatsapp_consent_at?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          booked_at?: string
          booked_by?: string
          called_at?: string | null
          chair_id?: string | null
          checked_in?: boolean
          child_age?: number
          child_name?: string
          code?: string
          collected_at?: string | null
          estimated_start?: string | null
          finish_today_confirmed?: boolean
          finished_at?: string | null
          heads_up_attempt_at?: string | null
          heads_up_sent_at?: string | null
          id?: string
          mani_pedi?: boolean
          moved_note?: string | null
          needs_wash?: boolean
          note?: string | null
          notify_error?: string | null
          notify_status?: string
          parent_name?: string
          phone?: string | null
          queue_order?: number
          ready_attempt_at?: string | null
          ready_sent_at?: string | null
          salon_day_id?: string
          service_id?: string
          source?: string
          started_at?: string | null
          status?: string
          waiting_pref?: string | null
          whatsapp_consent?: boolean
          whatsapp_consent_at?: string | null
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_chair_id_fkey"
            columns: ["chair_id"]
            isOneToOne: false
            referencedRelation: "chairs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_salon_day_id_fkey"
            columns: ["salon_day_id"]
            isOneToOne: false
            referencedRelation: "salon_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      chairs: {
        Row: {
          active: boolean
          braider_name: string
          current_booking_id: string | null
          delay_minutes: number
          id: string
          label: string
          num: number
          planned_minutes: number | null
          started_at: string | null
        }
        Insert: {
          active?: boolean
          braider_name: string
          current_booking_id?: string | null
          delay_minutes?: number
          id?: string
          label: string
          num: number
          planned_minutes?: number | null
          started_at?: string | null
        }
        Update: {
          active?: boolean
          braider_name?: string
          current_booking_id?: string | null
          delay_minutes?: number
          id?: string
          label?: string
          num?: number
          planned_minutes?: number | null
          started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chairs_current_booking_fk"
            columns: ["current_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_live: {
        Row: {
          id: number
          last_event_at: string | null
          last_event_type: string | null
          updated_at: string
          version: number
        }
        Insert: {
          id?: number
          last_event_at?: string | null
          last_event_type?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          id?: number
          last_event_at?: string | null
          last_event_type?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      salon_days: {
        Row: {
          closes_at: string
          created_at: string
          id: string
          is_demo: boolean
          label_date: string
          opens_at: string
        }
        Insert: {
          closes_at: string
          created_at?: string
          id?: string
          is_demo?: boolean
          label_date: string
          opens_at: string
        }
        Update: {
          closes_at?: string
          created_at?: string
          id?: string
          is_demo?: boolean
          label_date?: string
          opens_at?: string
        }
        Relationships: []
      }
      salon_events: {
        Row: {
          actor: string
          booking_id: string | null
          chair_id: string | null
          created_at: string
          details: Json
          id: string
          is_tap: boolean
          minutes: number | null
          salon_day_id: string | null
          type: string
        }
        Insert: {
          actor: string
          booking_id?: string | null
          chair_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          is_tap?: boolean
          minutes?: number | null
          salon_day_id?: string | null
          type: string
        }
        Update: {
          actor?: string
          booking_id?: string | null
          chair_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          is_tap?: boolean
          minutes?: number | null
          salon_day_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "salon_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salon_events_chair_id_fkey"
            columns: ["chair_id"]
            isOneToOne: false
            referencedRelation: "chairs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salon_events_salon_day_id_fkey"
            columns: ["salon_day_id"]
            isOneToOne: false
            referencedRelation: "salon_days"
            referencedColumns: ["id"]
          },
        ]
      }
      salon_settings: {
        Row: {
          active_chairs: number
          almost_done_minutes: number
          closing_buffer_minutes: number
          come_closer_minutes: number
          default_closing_time: string
          default_open_time: string
          demo_mode: boolean
          estimate_band_min_minutes: number
          estimate_band_percent: number
          grace_minutes: number
          id: number
          overrun_buffer_minutes: number
          pin: string
          prep_minutes: number
          salon_name: string
        }
        Insert: {
          active_chairs?: number
          almost_done_minutes?: number
          closing_buffer_minutes?: number
          come_closer_minutes?: number
          default_closing_time?: string
          default_open_time?: string
          demo_mode?: boolean
          estimate_band_min_minutes?: number
          estimate_band_percent?: number
          grace_minutes?: number
          id?: number
          overrun_buffer_minutes?: number
          pin?: string
          prep_minutes?: number
          salon_name?: string
        }
        Update: {
          active_chairs?: number
          almost_done_minutes?: number
          closing_buffer_minutes?: number
          come_closer_minutes?: number
          default_closing_time?: string
          default_open_time?: string
          demo_mode?: boolean
          estimate_band_min_minutes?: number
          estimate_band_percent?: number
          grace_minutes?: number
          id?: number
          overrun_buffer_minutes?: number
          pin?: string
          prep_minutes?: number
          salon_name?: string
        }
        Relationships: []
      }
      salon_state: {
        Row: {
          id: number
          last_event_at: string | null
          last_event_type: string | null
          updated_at: string
          version: number
        }
        Insert: {
          id?: number
          last_event_at?: string | null
          last_event_type?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          id?: number
          last_event_at?: string | null
          last_event_type?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      services: {
        Row: {
          active: boolean
          braid_minutes: number
          id: string
          is_special: boolean
          name: string
          price_rands: number
          sort_order: number
        }
        Insert: {
          active?: boolean
          braid_minutes: number
          id?: string
          is_special?: boolean
          name: string
          price_rands: number
          sort_order?: number
        }
        Update: {
          active?: boolean
          braid_minutes?: number
          id?: string
          is_special?: boolean
          name?: string
          price_rands?: number
          sort_order?: number
        }
        Relationships: []
      }
    }
    Views: {
      practice_salon_settings_public: {
        Row: {
          active_chairs: number | null
          almost_done_minutes: number | null
          closing_buffer_minutes: number | null
          come_closer_minutes: number | null
          default_closing_time: string | null
          default_open_time: string | null
          demo_mode: boolean | null
          estimate_band_min_minutes: number | null
          estimate_band_percent: number | null
          grace_minutes: number | null
          overrun_buffer_minutes: number | null
          prep_minutes: number | null
          salon_name: string | null
        }
        Insert: {
          active_chairs?: number | null
          almost_done_minutes?: number | null
          closing_buffer_minutes?: number | null
          come_closer_minutes?: number | null
          default_closing_time?: string | null
          default_open_time?: string | null
          demo_mode?: boolean | null
          estimate_band_min_minutes?: number | null
          estimate_band_percent?: number | null
          grace_minutes?: number | null
          overrun_buffer_minutes?: number | null
          prep_minutes?: number | null
          salon_name?: string | null
        }
        Update: {
          active_chairs?: number | null
          almost_done_minutes?: number | null
          closing_buffer_minutes?: number | null
          come_closer_minutes?: number | null
          default_closing_time?: string | null
          default_open_time?: string | null
          demo_mode?: boolean | null
          estimate_band_min_minutes?: number | null
          estimate_band_percent?: number | null
          grace_minutes?: number | null
          overrun_buffer_minutes?: number | null
          prep_minutes?: number | null
          salon_name?: string | null
        }
        Relationships: []
      }
      practice_services: {
        Row: {
          active: boolean | null
          braid_minutes: number | null
          id: string | null
          is_special: boolean | null
          name: string | null
          price_rands: number | null
          sort_order: number | null
        }
        Insert: {
          active?: boolean | null
          braid_minutes?: number | null
          id?: string | null
          is_special?: boolean | null
          name?: string | null
          price_rands?: number | null
          sort_order?: number | null
        }
        Update: {
          active?: boolean | null
          braid_minutes?: number | null
          id?: string | null
          is_special?: boolean | null
          name?: string | null
          price_rands?: number | null
          sort_order?: number | null
        }
        Relationships: []
      }
      salon_settings_public: {
        Row: {
          active_chairs: number | null
          almost_done_minutes: number | null
          closing_buffer_minutes: number | null
          come_closer_minutes: number | null
          default_closing_time: string | null
          default_open_time: string | null
          demo_mode: boolean | null
          estimate_band_min_minutes: number | null
          estimate_band_percent: number | null
          grace_minutes: number | null
          overrun_buffer_minutes: number | null
          prep_minutes: number | null
          salon_name: string | null
        }
        Insert: {
          active_chairs?: number | null
          almost_done_minutes?: number | null
          closing_buffer_minutes?: number | null
          come_closer_minutes?: number | null
          default_closing_time?: string | null
          default_open_time?: string | null
          demo_mode?: boolean | null
          estimate_band_min_minutes?: number | null
          estimate_band_percent?: number | null
          grace_minutes?: number | null
          overrun_buffer_minutes?: number | null
          prep_minutes?: number | null
          salon_name?: string | null
        }
        Update: {
          active_chairs?: number | null
          almost_done_minutes?: number | null
          closing_buffer_minutes?: number | null
          come_closer_minutes?: number | null
          default_closing_time?: string | null
          default_open_time?: string | null
          demo_mode?: boolean | null
          estimate_band_min_minutes?: number | null
          estimate_band_percent?: number | null
          grace_minutes?: number | null
          overrun_buffer_minutes?: number | null
          prep_minutes?: number | null
          salon_name?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_complete_pin_setup: { Args: { new_pin: string }; Returns: Json }
      admin_pin_setup_open: { Args: never; Returns: boolean }
      admin_record_pin_setup_failure: { Args: never; Returns: undefined }
      book_place: {
        Args: {
          child_age: number
          child_name: string
          mani_pedi?: boolean
          needs_wash?: boolean
          note?: string
          parent_name: string
          phone: string
          service_id: string
          waiting_pref?: string
        }
        Returns: Json
      }
      booking_options: {
        Args: { needs_wash?: boolean }
        Returns: {
          finish_high: string
          fits: boolean
          people_ahead: number
          service_id: string
          start_high: string
          start_low: string
        }[]
      }
      cancel_booking: { Args: { code: string }; Returns: Json }
      find_booking: {
        Args: { child_name: string; phone: string }
        Returns: Json
      }
      get_booking: { Args: { code: string }; Returns: Json }
      practice_book_place: {
        Args: {
          child_age: number
          child_name: string
          mani_pedi?: boolean
          needs_wash?: boolean
          note?: string
          parent_name: string
          phone: string
          service_id: string
          waiting_pref?: string
        }
        Returns: Json
      }
      practice_booking_options: {
        Args: { needs_wash?: boolean }
        Returns: {
          finish_high: string
          fits: boolean
          people_ahead: number
          service_id: string
          start_high: string
          start_low: string
        }[]
      }
      practice_cancel_booking: { Args: { code: string }; Returns: Json }
      practice_find_booking: {
        Args: { child_name: string; phone: string }
        Returns: Json
      }
      practice_get_booking: { Args: { code: string }; Returns: Json }
      practice_public_overview: { Args: never; Returns: Json }
      practice_record_whatsapp_consent: {
        Args: { code: string; phone: string }
        Returns: boolean
      }
      practice_reset_demo: { Args: { pin: string }; Returns: Json }
      practice_salon_action: {
        Args: {
          action: string
          booking_id?: string
          chair_id?: string
          pin: string
          value?: Json
        }
        Returns: Json
      }
      practice_salon_extras: { Args: { pin: string }; Returns: Json }
      practice_salon_list: { Args: { pin: string }; Returns: Json }
      practice_salon_login: { Args: { pin: string }; Returns: boolean }
      practice_update_chair: {
        Args: { active: boolean; braider_name: string; id: string; pin: string }
        Returns: Json
      }
      practice_update_service: {
        Args: {
          braid_minutes: number
          id: string
          pin: string
          price_rands: number
        }
        Returns: Json
      }
      practice_update_settings: {
        Args: { pin: string; settings: Json }
        Returns: Json
      }
      public_overview: { Args: never; Returns: Json }
      record_whatsapp_consent: {
        Args: { code: string; phone: string }
        Returns: boolean
      }
      reset_demo: { Args: { pin: string }; Returns: Json }
      salon_action: {
        Args: {
          action: string
          booking_id?: string
          chair_id?: string
          pin: string
          value?: Json
        }
        Returns: Json
      }
      salon_extras: { Args: { pin: string }; Returns: Json }
      salon_list: { Args: { pin: string }; Returns: Json }
      salon_login: { Args: { pin: string }; Returns: boolean }
      salon_sign_in: { Args: { device?: string; pin: string }; Returns: Json }
      update_chair: {
        Args: { active: boolean; braider_name: string; id: string; pin: string }
        Returns: Json
      }
      update_service: {
        Args: {
          braid_minutes: number
          id: string
          pin: string
          price_rands: number
        }
        Returns: Json
      }
      update_settings: { Args: { pin: string; settings: Json }; Returns: Json }
      whatsapp_claim: { Args: { pin: string }; Returns: Json }
      whatsapp_record: {
        Args: {
          booking_id: string
          error?: string
          kind: string
          ok: boolean
          pin: string
        }
        Returns: boolean
      }
      whatsapp_retry: {
        Args: { booking_id: string; pin: string }
        Returns: boolean
      }
      whatsapp_status: { Args: { pin: string }; Returns: Json }
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
