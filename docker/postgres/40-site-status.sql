CREATE TABLE IF NOT EXISTS public.site_status (
  id integer PRIMARY KEY DEFAULT 1,
  status text NOT NULL DEFAULT 'online',
  is_active boolean NOT NULL DEFAULT false,
  message text NOT NULL DEFAULT 'SAEON observations monitor API is online.',
  details text,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_status_singleton CHECK (id = 1),
  CONSTRAINT site_status_status_check CHECK (
    status IN ('online', 'normal', 'done', 'testing', 'maintenance', 'warning', 'degraded', 'offline')
  )
);

INSERT INTO public.site_status (id, status, message, details, updated_by, updated_at)
VALUES (
  1,
  'online',
  'SAEON observations monitor API is online.',
  'Set status to testing, maintenance, warning, degraded, or offline to show the public warning banner. Set status to done, online, or normal to hide it.',
  'system',
  now()
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.site_status
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false;
