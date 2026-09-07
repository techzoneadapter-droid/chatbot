insert into public.product_categories (name, description) values
  ('Son noi that', 'Demo category'),
  ('Son ngoai that', 'Demo category'),
  ('Son lot', 'Demo category'),
  ('Son chong tham', 'Demo category'),
  ('Son trang tri', 'Demo category'),
  ('Bot ba', 'Demo category'),
  ('Phu kien', 'Demo category'),
  ('Khac', 'Demo category')
on conflict (name) do nothing;

insert into public.products
  (
    name, sku, category, description, interior_or_exterior,
    main_benefits, suitable_surfaces, suitable_projects,
    coverage, coverage_value, coats, available_sizes,
    price, price_unit, discount, warranty, technical_info,
    application_instructions, drying_time, color_info,
    features, suitable_for, faq, active, featured, sort_order, is_demo
  )
values
  ('[DEMO] Demo Interior Plus', 'DEMO-INT-PLUS', 'Son noi that', 'Demo interior wall paint for living rooms, bedrooms and apartments.', 'interior',
   array['Smooth finish','Easy cleaning','Low odor'], array['Interior cement wall','Interior skim coat'], array['Living room repaint','Bedroom repaint','Apartment'],
   '10-12 m2/liter/coat depending on surface', 11, 2, array['1L','5L','18L'],
   null, null, null, null, '{"Type":"Demo interior topcoat"}',
   'Apply on a clean, dry surface. Primer is recommended before topcoat.', null, 'Demo color data only. Replace with real company color information.',
   array['Smooth finish','Easy cleaning','Low odor'], array['Living room','Bedroom','Apartment'], '{"Is primer needed?":"Primer is recommended."}', true, true, 10, true),
  ('[DEMO] Demo Exterior Shield', 'DEMO-EXT-SHIELD', 'Son ngoai that', 'Demo exterior paint for facades and outdoor walls.', 'exterior',
   array['Weather resistant','Mold resistant','Durable color'], array['Exterior cement wall','Facade'], array['Facade','Outdoor wall','Balcony'],
   '9-11 m2/liter/coat depending on surface', 10, 2, array['5L','18L'],
   null, null, null, null, '{"Type":"Demo exterior topcoat"}',
   'Apply in dry weather and avoid rain during the first drying period.', null, 'Demo color data only. Replace with real company color information.',
   array['Weather resistant','Mold resistant','Durable color'], array['Facade','Outdoor wall','Balcony'], '{}', true, true, 20, true),
  ('[DEMO] Demo Primer Pro', 'DEMO-PRI-PRO', 'Son lot', 'Demo alkaline-resistant primer that improves adhesion before topcoat.', 'both',
   array['Alkali resistant','Improves adhesion','Even topcoat color'], array['New wall','Skim-coated wall'], array['New house','Prepared wall'],
   '11-13 m2/liter/coat depending on surface', 12, 1, array['5L','18L'],
   null, null, null, null, '{"Type":"Demo primer"}',
   'Apply one primer coat before topcoat.', null, 'Demo color data only.',
   array['Alkali resistant','Improves adhesion','Even topcoat color'], array['New house','Prepared wall'], '{}', true, false, 30, true),
  ('[DEMO] Demo Waterproof Guard', 'DEMO-WP-GUARD', 'Son chong tham', 'Demo waterproofing material for areas with water exposure.', 'specialty',
   array['Waterproofing','Good adhesion','For cementitious surfaces'], array['Cement','Concrete'], array['Roof terrace','Bathroom','Damp wall'],
   'Depends on surface condition and application system', null, null, array['5kg','20kg'],
   null, null, null, null, '{"Type":"Demo waterproofing"}',
   'Surface inspection is required before selecting the application system.', null, 'Demo color data only.',
   array['Waterproofing','Good adhesion','For cementitious surfaces'], array['Roof terrace','Bathroom','Damp wall'], '{}', true, false, 40, true);
