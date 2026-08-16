do $$
declare
  v_def text;
  v_changed boolean := false;
begin
  select pg_get_functiondef('app.provision_demo_account(uuid)'::regprocedure) into v_def;

  if position('''grant'',12840,12840,''demo-seed-grant''' in v_def) > 0 then
    v_def := replace(v_def, '''grant'',12840,12840,''demo-seed-grant''', '''plan_grant'',12840,12840,''demo-seed-grant''');
    v_changed := true;
  elsif position('''plan_grant'',12840,12840,''demo-seed-grant''' in v_def) = 0 then
    raise exception 'Unexpected demo grant ledger shape in app.provision_demo_account';
  end if;

  if position('''consume'',-2840,10000,''demo-seed-consume''' in v_def) > 0 then
    v_def := replace(v_def, '''consume'',-2840,10000,''demo-seed-consume''', '''usage'',-2840,10000,''demo-seed-consume''');
    v_changed := true;
  elsif position('''usage'',-2840,10000,''demo-seed-consume''' in v_def) = 0 then
    raise exception 'Unexpected demo usage ledger shape in app.provision_demo_account';
  end if;

  if v_changed then
    execute v_def;
  end if;
end $$;
