"""Add fictional catalogue examples without resetting existing accounts or bookings."""
from sqlalchemy import select
from deploy.inspect_database import load_environment, ROOT


def main():
    load_environment()
    from backend.core import engine, users
    from backend import rentals as r, services as s
    from backend.credentials import hash_password
    password=(ROOT/'.demo-credentials.txt').read_text().splitlines()[1].split(': ',1)[1]
    additions=[]
    with engine.begin() as conn:
        conn.exec_driver_sql('SELECT pg_advisory_xact_lock(67432109)')
        owner=dict(conn.execute(select(users).where(users.c.email=='owner@example.test')).mappings().one())
        customer=dict(conn.execute(select(users).where(users.c.email=='customer@example.test')).mappings().one())
        titles=set(conn.scalars(select(r.listings.c.title).where(r.listings.c.owner_id==owner['id'])))
        for title,category,price,accessories in [
            ('Cordless drill kit','Basic tools',18000,'Drill, charger and six bits'),
            ('Folding ladder','Basic tools',12000,'Rubber feet and locking brace'),
            ('Portable speaker','Projectors/party equipment',25000,'Charging cable and carry case'),
            ('Camping chairs — pair','Camping equipment',15000,'Two folding chairs and bags'),
            ('Handheld vacuum','Household equipment',20000,'Brush and crevice attachments'),
            ('Folding picnic table','Household equipment',16000,'Table and carry handle')]:
            if title not in titles:
                r.publish(r.Listing(title=title,category=category,description='Fictional demonstration listing. Available for local pickup by arrangement.',
                    area='Dadar',daily_price=price,condition='Good working condition; minor cosmetic wear',accessories=accessories,
                    pickup_instructions='Arrange handover at the demonstration lobby.',return_instructions='Return clean with all listed accessories.'),conn,owner)
        providers=[]
        for role,name,category,basis,rate in [
            ('organiser','Kavya Iyer','Organising','hourly',30000),
            ('cleaner','Arjun Das','Cleaning','fixed',85000),
            ('assembler','Neha Patel','Furniture assembly','fixed',65000),
            ('eventhelper','Kabir Sen','Event setup','hourly',35000)]:
            email=role+'@example.test'
            person=conn.execute(select(users).where(users.c.email==email)).mappings().first()
            if not person:
                person=conn.execute(users.insert().values(name=name,email=email,password_hash=hash_password(password),area='Dadar').returning(users)).mappings().one()
                additions.append(email)
            person=dict(person)
            if not conn.scalar(select(s.provider_profiles.c.user_id).where(s.provider_profiles.c.user_id==person['id'])):
                s.save_provider(s.Provider(adult_declared=True,bio=f'Fictional demo provider offering {category.lower()} by arrangement.',categories=[category],
                    offerings=['everyday'],experience='Self-declared experience; demonstration profile.',area='Dadar',availability='Weekdays and weekends by arrangement',basis=basis,rate=rate),conn,person)
            providers.append(person)
        existing=[row['title'] for row in conn.scalars(select(s.task_requests.c.details).where(s.task_requests.c.customer_id==customer['id']))]
        for title,category,description in [('Organise a study room','Organising','Sort books and organise a small study room.'),('Set up a birthday gathering','Event setup','Arrange chairs and decorations for a small gathering.')]:
            if title not in existing:
                s.post_request(s.Task(title=title,category=category,description=description,area='Dadar',preferred_schedule='This weekend by arrangement',materials='Customer supplies materials',budget=100000),conn,customer)
    if additions:
        with (ROOT/'.demo-credentials.txt').open('a') as file:
            file.write('\nAdditional demo providers (same password):\n'+'\n'.join(additions)+'\n')
    engine.dispose()
    print('Demo catalogue ready: at least eight rental items, six providers and three tasks. Existing bookings preserved.')


if __name__ == '__main__':
    main()
