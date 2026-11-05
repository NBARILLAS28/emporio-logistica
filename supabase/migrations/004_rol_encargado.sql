-- =====================================================================
-- EMPORIO · Logística interna — 004: nuevo rol «Encargado»
-- Ejecutar UNA vez en: Supabase → SQL Editor → New query → Run.
-- Es seguro repetirlo (idempotente). No borra ni cambia datos.
--
-- Encargado = Supervisor SIN el permiso «costos»:
--   · el servidor nunca le envía costo / precio / costoU / precioU
--     (inv_pull ya quita esas llaves a todo rol sin «costos»)
--   · al guardar, conserva los costos que ya existían (inv_push)
-- =====================================================================

-- 1) permitir el valor 'encargado' en el perfil
alter table public.inv_perfiles drop constraint if exists inv_perfiles_rol_check;
alter table public.inv_perfiles add constraint inv_perfiles_rol_check
  check (rol in ('admin','supervisor','encargado','operador','consulta'));

-- 2) permisos por rol (espejo de la app)
create or replace function public.inv_perms(p_rol text) returns text[]
language sql immutable set search_path = '' as $$
  select case p_rol
    when 'admin'      then array['ver','mov','turno','catalogo','ajuste','solicitud','reportes','costos','anular','usuarios','config','respaldo']
    when 'supervisor' then array['ver','mov','turno','catalogo','ajuste','solicitud','reportes','costos','anular']
    when 'encargado'  then array['ver','mov','turno','catalogo','ajuste','solicitud','reportes','anular']
    when 'operador'   then array['ver','mov','turno','solicitud','reportes']
    when 'consulta'   then array['ver','reportes']
    else array[]::text[] end
$$;

-- 3) el administrador puede asignar el nuevo rol
create or replace function public.inv_admin_perfil(p_id uuid, p_rol text, p_estado text, p_nombre text default null, p_tel text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare t public.inv_perfiles; otros int;
begin
  if public.inv_rol() is distinct from 'admin' then raise exception 'sin_permiso'; end if;
  if p_rol not in ('admin','supervisor','encargado','operador','consulta') or p_estado not in ('pendiente','activo','inactivo') then raise exception 'valor_invalido'; end if;
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

-- verificación rápida (debe mostrar 8 permisos, sin «costos»)
select public.inv_perms('encargado') as permisos_encargado;
