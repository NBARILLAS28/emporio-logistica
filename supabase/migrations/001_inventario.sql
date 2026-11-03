-- =====================================================================
-- EMPORIO · Logística interna — esquema de base de datos (Supabase)
-- Ejecutar UNA vez en: Supabase → SQL Editor → New query → Run.
-- Es seguro repetirlo (idempotente). No toca ninguna tabla de otras apps:
-- todo lo nuevo empieza con "inv_".
-- Usa las cuentas de Authentication (correo + contraseña) que ya existan.
-- =====================================================================

-- ---------- tablas ----------
create table if not exists public.inv_perfiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nombre      text not null default '',
  email       text not null default '',
  tel         text not null default '',
  rol         text not null default 'consulta' check (rol in ('admin','supervisor','operador','consulta')),
  estado      text not null default 'pendiente' check (estado in ('pendiente','activo','inactivo')),
  creado      timestamptz not null default now(),
  actualizado timestamptz not null default now()
);

-- Registros del inventario (artículos, movimientos, solicitudes, etc.).
-- "col" es el tipo de registro; "data" el contenido; "u" la marca de tiempo del
-- último cambio (gana el más reciente); "del" = borrado lógico (nunca se pierde historial).
create table if not exists public.inv_registros (
  col  text    not null check (col in ('categories','suppliers','items','movements','requests','counts','audit','settings')),
  id   text    not null check (char_length(id) between 1 and 64),
  data jsonb   not null,
  u    bigint  not null,
  del  boolean not null default false,
  por  uuid,
  ts   timestamptz not null default now(),
  primary key (col, id)
);
create index if not exists inv_registros_ts_idx on public.inv_registros (ts, col, id);

-- Código de configuración del primer administrador (solo se guarda su huella).
create table if not exists public.inv_config (
  id        int primary key default 1 check (id = 1),
  code_hash text not null,
  fallos    int  not null default 0,
  bloqueo   timestamptz
);
insert into public.inv_config (id, code_hash)
values (1, '6416bc2ee8ea34d8065ca844b781ffc6629dac7f1c6d412cbefc477e57ba321f')
on conflict (id) do nothing;

alter table public.inv_perfiles  enable row level security;
alter table public.inv_registros enable row level security;
alter table public.inv_config    enable row level security;   -- sin políticas: nadie la lee desde la API

-- ---------- permisos por rol (espejo de la app) ----------
create or replace function public.inv_perms(p_rol text) returns text[]
language sql immutable set search_path = '' as $$
  select case p_rol
    when 'admin'      then array['ver','mov','turno','catalogo','ajuste','solicitud','reportes','costos','anular','usuarios','config','respaldo']
    when 'supervisor' then array['ver','mov','turno','catalogo','ajuste','solicitud','reportes','costos','anular']
    when 'operador'   then array['ver','mov','turno','solicitud','reportes']
    when 'consulta'   then array['ver','reportes']
    else array[]::text[] end
$$;

create or replace function public.inv_rol() returns text
language sql stable security definer set search_path = '' as $$
  select rol from public.inv_perfiles where id = auth.uid() and estado = 'activo'
$$;

create or replace function public.inv_can(p text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(p = any (public.inv_perms(public.inv_rol())), false)
$$;

-- ---------- políticas de lectura directa ----------
drop policy if exists inv_perfiles_ver on public.inv_perfiles;
create policy inv_perfiles_ver on public.inv_perfiles for select to authenticated
  using (id = auth.uid() or public.inv_rol() = 'admin');

-- Lectura directa (y tiempo real) solo para quienes pueden ver costos; el resto lee por inv_pull(),
-- que quita costos y precios de compra.
drop policy if exists inv_registros_ver on public.inv_registros;
create policy inv_registros_ver on public.inv_registros for select to authenticated
  using (public.inv_can('costos'));

revoke all on public.inv_perfiles, public.inv_registros, public.inv_config from anon, authenticated;
grant select on public.inv_perfiles, public.inv_registros to authenticated;

-- ---------- sesión / registro ----------
create or replace function public.inv_yo_json() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'perfil', (select to_jsonb(p) from public.inv_perfiles p where p.id = auth.uid()),
    'hay_admin', exists (select 1 from public.inv_perfiles where rol = 'admin' and estado = 'activo')
  )
$$;

-- Se llama al iniciar sesión: crea el perfil (pendiente de aprobación) si no existe.
create or replace function public.inv_registrar(p_nombre text default '', p_tel text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_email text;
begin
  if auth.uid() is null then raise exception 'sin_sesion'; end if;
  select email into v_email from auth.users where id = auth.uid();
  insert into public.inv_perfiles (id, nombre, email, tel)
  values (auth.uid(), left(coalesce(nullif(trim(p_nombre), ''), split_part(coalesce(v_email, ''), '@', 1)), 80), coalesce(v_email, ''), left(coalesce(p_tel, ''), 30))
  on conflict (id) do update set email = excluded.email;
  return public.inv_yo_json();
end $$;

-- Primer administrador: solo funciona mientras no exista ninguno y con el código de configuración.
create or replace function public.inv_primer_admin(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c public.inv_config;
begin
  if auth.uid() is null then raise exception 'sin_sesion'; end if;
  if exists (select 1 from public.inv_perfiles where rol = 'admin' and estado = 'activo') then
    return jsonb_build_object('ok', false, 'error', 'Ya existe un administrador.');
  end if;
  select * into c from public.inv_config where id = 1 for update;
  if c.bloqueo is not null and c.bloqueo > now() then
    return jsonb_build_object('ok', false, 'error', 'Demasiados intentos. Espera unos minutos.');
  end if;
  if encode(sha256(convert_to(upper(trim(coalesce(p_code, ''))), 'UTF8')), 'hex') <> c.code_hash then
    update public.inv_config
       set bloqueo = case when c.fallos + 1 >= 5 then now() + interval '10 minutes' else c.bloqueo end,
           fallos  = case when c.fallos + 1 >= 5 then 0 else c.fallos + 1 end
     where id = 1;
    return jsonb_build_object('ok', false, 'error', 'Código incorrecto.');
  end if;
  perform public.inv_registrar();
  update public.inv_perfiles set rol = 'admin', estado = 'activo', actualizado = now() where id = auth.uid();
  update public.inv_config set fallos = 0, bloqueo = null where id = 1;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- equipo ----------
create or replace function public.inv_equipo() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_rol text := public.inv_rol();
begin
  if v_rol is null then raise exception 'sin_acceso'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre, 'rol', p.rol, 'estado', p.estado,
             'email', case when v_rol = 'admin' then p.email end, 'tel', case when v_rol = 'admin' then p.tel end,
             'creado', case when v_rol = 'admin' then p.creado end) order by p.nombre)
    from public.inv_perfiles p
    where v_rol = 'admin' or p.estado <> 'pendiente'), '[]'::jsonb);
end $$;

create or replace function public.inv_admin_perfil(p_id uuid, p_rol text, p_estado text, p_nombre text default null, p_tel text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.inv_perfiles; otros int;
begin
  if public.inv_rol() is distinct from 'admin' then raise exception 'sin_permiso'; end if;
  if p_rol not in ('admin','supervisor','operador','consulta') or p_estado not in ('pendiente','activo','inactivo') then raise exception 'valor_invalido'; end if;
  select * into t from public.inv_perfiles where id = p_id for update;
  if not found then raise exception 'no_existe'; end if;
  if t.rol = 'admin' and t.estado = 'activo' and (p_rol <> 'admin' or p_estado <> 'activo') then
    select count(*) into otros from public.inv_perfiles where rol = 'admin' and estado = 'activo' and id <> p_id;
    if otros = 0 then raise exception 'ultimo_admin'; end if;
  end if;
  update public.inv_perfiles set rol = p_rol, estado = p_estado,
         nombre = left(coalesce(nullif(trim(p_nombre), ''), nombre), 80), tel = left(coalesce(p_tel, tel), 30), actualizado = now()
   where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- sincronización ----------
create or replace function public.inv_sin_costos(p_data jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select p_data - 'costo' - 'precio' - 'costoU' - 'precioU'
$$;

-- Lee cambios desde un cursor (ts, col, id). Quita costos si el rol no los puede ver.
create or replace function public.inv_pull(p_ts text default '1970-01-01T00:00:00Z', p_col text default '', p_id text default '', p_limit int default 1000) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_rol text := public.inv_rol(); v_ts timestamptz; v_costos boolean; v_rows jsonb;
begin
  if v_rol is null or not public.inv_can('ver') then raise exception 'sin_acceso'; end if;
  v_costos := public.inv_can('costos');
  v_ts := p_ts::timestamptz;
  if coalesce(p_col, '') = '' then v_ts := v_ts - interval '10 seconds'; end if;   -- solape de seguridad
  select coalesce(jsonb_agg(jsonb_build_object('col', x.col, 'id', x.id,
           'data', case when v_costos then x.data else public.inv_sin_costos(x.data) end,
           'u', x.u, 'del', x.del,
           'ts', to_char(x.ts at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) order by x.ts, x.col, x.id), '[]'::jsonb)
    into v_rows
    from (select * from public.inv_registros r
           where (r.ts, r.col, r.id) > (v_ts, coalesce(p_col, ''), coalesce(p_id, ''))
           order by r.ts, r.col, r.id limit least(greatest(p_limit, 1), 2000)) x;
  return jsonb_build_object('rows', v_rows);
end $$;

-- Escribe cambios. Cada registro se valida contra el rol; gana el de "u" más reciente.
create or replace function public.inv_push(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_rol text := public.inv_rol(); v_perms text[]; v_costos boolean;
  r jsonb; res jsonb := '[]'::jsonb;
  v_col text; v_id text; v_data jsonb; v_u bigint; v_del boolean; v_old public.inv_registros; v_ok boolean;
  v_keys text[] := array['costo','precio','costoU','precioU'];
begin
  if v_rol is null then raise exception 'sin_acceso'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then raise exception 'lote_invalido'; end if;
  v_perms := public.inv_perms(v_rol); v_costos := 'costos' = any (v_perms);
  for r in select value from jsonb_array_elements(p_rows) loop
    begin
      v_col := r->>'col'; v_id := r->>'id'; v_data := r->'data'; v_u := (r->>'u')::bigint; v_del := coalesce((r->>'del')::boolean, false);
      if v_col is null or v_id is null or jsonb_typeof(v_data) <> 'object' or v_u is null or char_length(v_id) > 64 or pg_column_size(v_data) > 40000 then
        res := res || jsonb_build_object('k', coalesce(v_col, '?') || ':' || coalesce(v_id, '?'), 'ok', false, 'err', 'invalido'); continue;
      end if;
      v_ok := case v_col
        when 'categories' then 'catalogo' = any (v_perms)
        when 'suppliers'  then 'catalogo' = any (v_perms)
        when 'items'      then 'catalogo' = any (v_perms)
        when 'movements'  then v_perms && array['mov','turno','ajuste']
        when 'counts'     then 'ajuste' = any (v_perms)
        when 'requests'   then 'solicitud' = any (v_perms)
        when 'audit'      then true
        when 'settings'   then 'config' = any (v_perms)
        else false end;
      if not v_ok then
        res := res || jsonb_build_object('k', v_col || ':' || v_id, 'ok', false, 'err', 'permiso'); continue;
      end if;
      select * into v_old from public.inv_registros where col = v_col and id = v_id for update;
      if not v_costos then
        v_data := v_data - v_keys;
        if found then   -- conserva los costos que ya existían (el usuario no los puede ver ni cambiar)
          v_data := v_data || coalesce((select jsonb_object_agg(k, v) from jsonb_each(v_old.data) as e(k, v) where k = any (v_keys)), '{}'::jsonb);
        end if;
      end if;
      if v_col = 'audit' then
        insert into public.inv_registros (col, id, data, u, del, por) values (v_col, v_id, v_data, v_u, false, auth.uid()) on conflict (col, id) do nothing;
      else
        insert into public.inv_registros as t (col, id, data, u, del, por) values (v_col, v_id, v_data, v_u, v_del, auth.uid())
        on conflict (col, id) do update set data = excluded.data, u = excluded.u, del = excluded.del, por = excluded.por, ts = now()
          where t.u <= excluded.u;
      end if;
      res := res || jsonb_build_object('k', v_col || ':' || v_id, 'ok', true);
    exception when others then
      res := res || jsonb_build_object('k', coalesce(v_col, '?') || ':' || coalesce(v_id, '?'), 'ok', false, 'err', 'invalido');
    end;
  end loop;
  return res;
end $$;

-- ---------- permisos de ejecución: solo usuarios con sesión ----------
do $$
declare f text;
begin
  foreach f in array array[
    'inv_perms(text)','inv_rol()','inv_can(text)','inv_yo_json()','inv_registrar(text,text)','inv_primer_admin(text)',
    'inv_equipo()','inv_admin_perfil(uuid,text,text,text,text)','inv_sin_costos(jsonb)','inv_pull(text,text,text,int)','inv_push(jsonb)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------- tiempo real ----------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inv_registros') then
    alter publication supabase_realtime add table public.inv_registros;
  end if;
end $$;
